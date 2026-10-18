import type { Restaurant } from '@tableos/db';
import {
  type ChecklistDto,
  type CreateRestaurantInput,
  type InviteStaffInput,
  type MeDto,
  type RestaurantDto,
  type StaffInviteDto,
  type StaffMemberDto,
  type UpdateRestaurantInput,
  normalisePhone,
  openingHours as openingHoursSchema,
} from '@tableos/schemas';
import type { AuthUser, Deps } from '../../context';
import { randomToken } from '../../lib/crypto';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { iso } from '../../lib/http';
import { withTx } from '../../lib/tx';
import { JOBS } from '../../jobs/queue';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base.length >= 3 ? base : `${base || 'cafe'}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

export function toRestaurantDto(r: Restaurant): RestaurantDto {
  const hours = openingHoursSchema.safeParse(r.openingHours);
  return {
    id: r.id,
    slug: r.slug,
    canChangeSlug: r.slugChangedAt === null,
    name: r.name,
    logoUrl: r.logoUrl,
    coverUrl: r.coverUrl,
    address: r.address,
    city: r.city,
    cuisine: r.cuisine,
    gstin: r.gstin,
    fssaiNo: r.fssaiNo,
    timezone: r.timezone,
    languages: r.languages,
    theme: (r.theme as { primary?: string })?.primary ? { primary: (r.theme as { primary: string }).primary } : { primary: '#FC8019' },
    openingHours: hours.success ? hours.data : openingHoursSchema.parse({}),
    orderingEnabled: r.orderingEnabled,
    requireFirstOrderAcceptance: r.requireFirstOrderAcceptance,
    serviceChargeBp: r.serviceChargeBp,
    googleReviewUrl: r.googleReviewUrl,
    plan: r.plan,
    flatPlanUntil: iso(r.flatPlanUntil),
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

export class RestaurantsService {
  constructor(private readonly deps: Deps) {}

  async me(user: AuthUser): Promise<MeDto> {
    const [profile, memberships] = await Promise.all([
      this.deps.db.user.findUniqueOrThrow({ where: { id: user.id } }),
      this.deps.db.membership.findMany({
        where: { userId: user.id, restaurant: { status: { not: 'closed' } } },
        include: { restaurant: { select: { name: true, slug: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      user: {
        id: profile.id,
        email: profile.email,
        emailVerified: Boolean(profile.emailVerifiedAt),
        phone: profile.phone,
        phoneVerified: Boolean(profile.phoneVerifiedAt),
        name: profile.name,
        isPlatformAdmin: profile.isPlatformAdmin,
      },
      memberships: memberships.map((m) => ({ restaurantId: m.restaurantId, restaurantName: m.restaurant.name, slug: m.restaurant.slug, role: m.role })),
    };
  }

  async updateProfile(userId: string, name: string) {
    await this.deps.db.user.update({ where: { id: userId }, data: { name } });
  }

  private async uniqueSlug(base: string): Promise<string> {
    let candidate = base;
    for (let i = 2; i < 50; i++) {
      const taken = await this.deps.db.restaurant.findUnique({ where: { slug: candidate }, select: { id: true } });
      if (!taken) return candidate;
      candidate = `${base}-${i}`;
    }
    return `${base}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
  }

  /** On create: owner membership, a wallet at zero (spec §3.7). Pricing falls back to the global default. */
  async create(user: AuthUser, input: CreateRestaurantInput): Promise<RestaurantDto> {
    const slug = await this.uniqueSlug(slugify(input.name));
    const restaurant = await withTx(this.deps.db, async (tx) => {
      const r = await tx.restaurant.create({
        data: {
          slug,
          name: input.name,
          address: input.address ?? null,
          city: input.city ?? null,
          cuisine: input.cuisine,
          logoUrl: input.logoUrl ?? null,
          gstin: input.gstin ?? null,
          fssaiNo: input.fssaiNo ?? null,
          ...(input.openingHours ? { openingHours: input.openingHours } : {}),
        },
      });
      await tx.membership.create({ data: { userId: user.id, restaurantId: r.id, role: 'owner' } });
      await tx.wallet.create({ data: { restaurantId: r.id } });
      return r;
    });
    return toRestaurantDto(restaurant);
  }

  async get(restaurantId: string): Promise<RestaurantDto> {
    const r = await this.deps.db.restaurant.findUnique({ where: { id: restaurantId } });
    if (!r) throw notFound('Restaurant');
    return toRestaurantDto(r);
  }

  async update(restaurantId: string, actorUserId: string, input: UpdateRestaurantInput): Promise<RestaurantDto> {
    const current = await this.deps.db.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    const data: Record<string, unknown> = { ...input };
    if (input.slug !== undefined && input.slug !== current.slug) {
      if (current.slugChangedAt) throw conflict('slug_locked', 'The menu link can be changed only once');
      const taken = await this.deps.db.restaurant.findUnique({ where: { slug: input.slug }, select: { id: true } });
      if (taken) throw conflict('slug_taken', 'That link is already in use');
      data.slugChangedAt = this.deps.clock();
    } else {
      delete data.slug;
    }
    const updated = await this.deps.db.restaurant.update({ where: { id: restaurantId }, data });
    if (input.serviceChargeBp !== undefined || input.orderingEnabled !== undefined) {
      await this.deps.db.auditLog.create({
        data: {
          actorUserId,
          restaurantId,
          action: 'restaurant.settings',
          entityType: 'restaurant',
          entityId: restaurantId,
          before: { serviceChargeBp: current.serviceChargeBp, orderingEnabled: current.orderingEnabled },
          after: { serviceChargeBp: updated.serviceChargeBp, orderingEnabled: updated.orderingEnabled },
        },
      });
    }
    return toRestaurantDto(updated);
  }

  /** Derived from data, never stored (spec §3.7). */
  async checklist(restaurantId: string): Promise<ChecklistDto> {
    const [items, tables, r, orders] = await Promise.all([
      this.deps.db.menuItem.count({ where: { restaurantId, visible: true } }),
      this.deps.db.restaurantTable.count({ where: { restaurantId, active: true } }),
      this.deps.db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { qrDownloadedAt: true } }),
      this.deps.db.order.count({ where: { restaurantId } }),
    ]);
    return { menuPublished: items > 0, tableCreated: tables > 0, qrDownloaded: Boolean(r.qrDownloadedAt), testOrderPlaced: orders > 0 };
  }

  // ───── Staff ─────

  async listStaff(restaurantId: string): Promise<{ members: StaffMemberDto[]; invites: StaffInviteDto[] }> {
    const now = this.deps.clock();
    const [members, invites] = await Promise.all([
      this.deps.db.membership.findMany({ where: { restaurantId }, include: { user: true }, orderBy: { createdAt: 'asc' } }),
      this.deps.db.staffInvite.findMany({ where: { restaurantId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      members: members.map((m) => ({
        membershipId: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        phone: m.user.phone,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
      })),
      invites: invites.map((i) => ({ id: i.id, email: i.email, phone: i.phone, role: i.role, expiresAt: i.expiresAt.toISOString(), createdAt: i.createdAt.toISOString() })),
    };
  }

  async invite(restaurantId: string, invitedBy: string, input: InviteStaffInput): Promise<StaffInviteDto> {
    const phone = input.phone ? normalisePhone(input.phone) : null;
    const email = input.email ?? null;
    const existing = await this.deps.db.membership.findFirst({
      where: { restaurantId, user: email ? { email } : { phone } },
      select: { id: true },
    });
    if (existing) throw conflict('already_member', 'This person is already on your team');
    const now = this.deps.clock();
    const invite = await this.deps.db.staffInvite.create({
      data: { restaurantId, email, phone, role: input.role, token: randomToken(24), invitedBy, expiresAt: new Date(now.getTime() + INVITE_TTL_MS) },
    });
    if (email) {
      await this.deps.jobs.send(JOBS.email, { restaurantId, template: 'staff_invite', to: email, vars: { token: invite.token, role: input.role } });
    }
    return { id: invite.id, email, phone, role: invite.role, expiresAt: invite.expiresAt.toISOString(), createdAt: invite.createdAt.toISOString() };
  }

  async revokeInvite(restaurantId: string, inviteId: string): Promise<void> {
    const r = await this.deps.db.staffInvite.updateMany({ where: { id: inviteId, restaurantId, acceptedAt: null }, data: { revokedAt: this.deps.clock() } });
    if (r.count === 0) throw notFound('Invite');
  }

  /** Accept an invite as the signed-in user; the invite's identifier must match a verified one. */
  async acceptInvite(user: AuthUser, token: string): Promise<{ restaurantId: string }> {
    const now = this.deps.clock();
    const invite = await this.deps.db.staffInvite.findUnique({ where: { token } });
    if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt < now) throw notFound('Invite');
    const matches = (invite.email && user.emailVerified && user.email === invite.email) || (invite.phone && user.phoneVerified && user.phone === invite.phone);
    if (!matches) throw forbidden('Sign in with the email or phone number this invite was sent to');
    await withTx(this.deps.db, async (tx) => {
      await tx.membership.upsert({
        where: { userId_restaurantId: { userId: user.id, restaurantId: invite.restaurantId } },
        create: { userId: user.id, restaurantId: invite.restaurantId, role: invite.role },
        update: {},
      });
      await tx.staffInvite.update({ where: { id: invite.id }, data: { acceptedAt: now } });
    });
    return { restaurantId: invite.restaurantId };
  }

  async updateMember(restaurantId: string, actorUserId: string, membershipId: string, role: 'manager' | 'waiter' | 'kitchen'): Promise<void> {
    const m = await this.deps.db.membership.findFirst({ where: { id: membershipId, restaurantId } });
    if (!m) throw notFound('Team member');
    if (m.role === 'owner') throw badRequest('The owner role cannot be changed here');
    await this.deps.db.membership.update({ where: { id: m.id }, data: { role } });
    await this.deps.db.auditLog.create({
      data: { actorUserId, restaurantId, action: 'membership.role', entityType: 'membership', entityId: m.id, before: { role: m.role }, after: { role } },
    });
  }

  async removeMember(restaurantId: string, actorUserId: string, membershipId: string): Promise<void> {
    const m = await this.deps.db.membership.findFirst({ where: { id: membershipId, restaurantId } });
    if (!m) throw notFound('Team member');
    if (m.role === 'owner') throw badRequest('The owner cannot be removed');
    await this.deps.db.membership.delete({ where: { id: m.id } });
    await this.deps.db.auditLog.create({
      data: { actorUserId, restaurantId, action: 'membership.remove', entityType: 'membership', entityId: m.id, before: { role: m.role, userId: m.userId } },
    });
  }

  /** Ownership transfer needs both identifiers verified (spec §3.6 Gate). */
  async transferOwnership(restaurantId: string, actor: AuthUser, membershipId: string): Promise<void> {
    if (!actor.emailVerified || !actor.phoneVerified) throw forbidden('Verify both your email and phone number to transfer ownership');
    await withTx(this.deps.db, async (tx) => {
      const target = await tx.membership.findFirst({ where: { id: membershipId, restaurantId } });
      if (!target) throw notFound('Team member');
      await tx.membership.update({ where: { userId_restaurantId: { userId: actor.id, restaurantId } }, data: { role: 'manager' } });
      await tx.membership.update({ where: { id: target.id }, data: { role: 'owner' } });
      await tx.auditLog.create({
        data: { actorUserId: actor.id, restaurantId, action: 'restaurant.transfer_ownership', entityType: 'membership', entityId: target.id, after: { newOwner: target.userId } },
      });
    });
  }
}
