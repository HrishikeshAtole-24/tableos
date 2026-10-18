import type { Prisma } from '@tableos/db';
import type { PlatformMetricsDto, PricingConfigInput } from '@tableos/schemas';
import type { z } from 'zod';
import type { merchantAccountInput } from '@tableos/schemas';
import type { Deps } from '../../context';
import { encrypt } from '../../lib/crypto';
import { notFound } from '../../lib/errors';
import { iso } from '../../lib/http';
import { getPricing } from '../wallet/wallet.repository';
import { toRestaurantDto } from '../restaurants/restaurants.service';

export class AdminService {
  constructor(private readonly deps: Deps) {}

  private audit(actorUserId: string, action: string, entityType: string, entityId: string | null, before: unknown, after: unknown, restaurantId?: string | null) {
    return this.deps.db.auditLog.create({
      data: {
        actorUserId,
        restaurantId: restaurantId ?? null,
        action,
        entityType,
        entityId,
        before: (before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (after ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async listRestaurants(q: { search?: string; status?: string; limit: number; cursor?: string }) {
    const where: Prisma.RestaurantWhereInput = {
      ...(q.status ? { status: q.status as 'active' } : {}),
      ...(q.search
        ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { slug: { contains: q.search, mode: 'insensitive' } }, { city: { contains: q.search, mode: 'insensitive' } }] }
        : {}),
    };
    const rows = await this.deps.db.restaurant.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        wallet: { select: { balancePaise: true, orderingPaused: true } },
        memberships: { where: { role: 'owner' }, include: { user: { select: { email: true, phone: true, name: true } } }, take: 1 },
        _count: { select: { orders: true, tables: true } },
      },
    });
    const page = rows.slice(0, q.limit);
    return {
      items: page.map((r) => ({
        ...toRestaurantDto(r),
        featureFlags: r.featureFlags,
        statusReason: r.statusReason,
        walletBalancePaise: r.wallet?.balancePaise ?? 0,
        orderingPaused: r.wallet?.orderingPaused ?? false,
        owner: r.memberships[0]?.user ?? null,
        orderCount: r._count.orders,
        tableCount: r._count.tables,
      })),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
    };
  }

  async getRestaurant(id: string) {
    const r = await this.deps.db.restaurant.findUnique({
      where: { id },
      include: {
        wallet: true,
        memberships: { include: { user: { select: { id: true, email: true, phone: true, name: true } } } },
        usageMonths: { orderBy: { monthKey: 'desc' }, take: 6 },
        _count: { select: { orders: true, tables: true, items: true } },
      },
    });
    if (!r) throw notFound('Restaurant');
    return {
      ...toRestaurantDto(r),
      featureFlags: r.featureFlags,
      statusReason: r.statusReason,
      wallet: r.wallet ? { balancePaise: r.wallet.balancePaise, orderingPaused: r.wallet.orderingPaused, zeroReachedAt: iso(r.wallet.zeroReachedAt) } : null,
      team: r.memberships.map((m) => ({ role: m.role, ...m.user })),
      usage: r.usageMonths.map((u) => ({ monthKey: u.monthKey, acceptedOrders: u.acceptedOrders, feesChargedPaise: u.feesChargedPaise })),
      counts: r._count,
    };
  }

  async setStatus(actorUserId: string, id: string, status: 'active' | 'suspended' | 'closed', reason: string) {
    const r = await this.deps.db.restaurant.findUnique({ where: { id } });
    if (!r) throw notFound('Restaurant');
    await this.deps.db.restaurant.update({ where: { id }, data: { status, statusReason: reason } });
    await this.audit(actorUserId, 'restaurant.status', 'restaurant', id, { status: r.status }, { status, reason }, id);
    return this.getRestaurant(id);
  }

  async setFeatureFlags(actorUserId: string, id: string, flags: string[]) {
    const r = await this.deps.db.restaurant.findUnique({ where: { id } });
    if (!r) throw notFound('Restaurant');
    await this.deps.db.restaurant.update({ where: { id }, data: { featureFlags: flags } });
    await this.audit(actorUserId, 'restaurant.feature_flags', 'restaurant', id, { flags: r.featureFlags }, { flags }, id);
  }

  async getPricingConfig(restaurantId: string | null) {
    if (restaurantId) return getPricing(this.deps.db, restaurantId);
    return (await this.deps.db.pricingConfig.findFirst({ where: { restaurantId: null } })) ?? this.deps.db.pricingConfig.create({ data: { restaurantId: null } });
  }

  /** Every amount is a config value admin can change without a deploy (spec §2.3). */
  async updatePricingConfig(actorUserId: string, input: PricingConfigInput) {
    const { restaurantId, ...fields } = input;
    const before = await this.getPricingConfig(restaurantId);
    let after;
    if (restaurantId) {
      const base = before.restaurantId === restaurantId ? {} : { ...stripMeta(before) };
      after = await this.deps.db.pricingConfig.upsert({
        where: { restaurantId },
        create: { ...base, ...fields, restaurantId },
        update: fields,
      });
    } else {
      after = await this.deps.db.pricingConfig.update({ where: { id: before.id }, data: fields });
    }
    await this.audit(actorUserId, 'pricing.update', 'pricing_config', after.id, stripMeta(before), stripMeta(after), restaurantId);
    return after;
  }

  async listImports(status?: string) {
    const rows = await this.deps.db.menuImport.findMany({
      where: status ? { status: status as 'failed' } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { restaurant: { select: { name: true, slug: true } } },
    });
    return rows.map((m) => ({
      id: m.id,
      restaurant: m.restaurant,
      restaurantId: m.restaurantId,
      status: m.status,
      fileCount: m.fileUrls.length,
      attempts: m.attempts,
      error: m.error,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async listMerchantAccounts() {
    const rows = await this.deps.db.merchantAccount.findMany({ orderBy: [{ restaurantId: 'asc' }, { priority: 'asc' }] });
    return rows.map((a) => ({ id: a.id, restaurantId: a.restaurantId, provider: a.provider, label: a.label, priority: a.priority, methods: a.methods, status: a.status, createdAt: a.createdAt.toISOString() }));
  }

  /** Credentials are encrypted with AES-256-GCM; the key lives outside the database. */
  async createMerchantAccount(actorUserId: string, input: z.infer<typeof merchantAccountInput>) {
    const a = await this.deps.db.merchantAccount.create({
      data: {
        restaurantId: input.restaurantId,
        provider: input.provider,
        label: input.label ?? null,
        priority: input.priority,
        methods: input.methods,
        credentialsEncrypted: encrypt(JSON.stringify(input.credentials), this.deps.env.CREDENTIALS_ENCRYPTION_KEY),
      },
    });
    await this.audit(actorUserId, 'merchant_account.create', 'merchant_account', a.id, null, { provider: a.provider, restaurantId: a.restaurantId, priority: a.priority }, a.restaurantId);
    return { id: a.id, webhookUrl: `${this.deps.env.API_PUBLIC_URL}/v1/webhooks/${a.provider}/${a.id}` };
  }

  async setMerchantAccountStatus(actorUserId: string, id: string, status: 'active' | 'disabled') {
    const a = await this.deps.db.merchantAccount.findUnique({ where: { id } });
    if (!a) throw notFound('Merchant account');
    await this.deps.db.merchantAccount.update({ where: { id }, data: { status } });
    await this.audit(actorUserId, 'merchant_account.status', 'merchant_account', id, { status: a.status }, { status }, a.restaurantId);
  }

  async metrics(): Promise<PlatformMetricsDto> {
    const now = this.deps.clock();
    const d30 = new Date(now.getTime() - 30 * 86_400_000);
    const d7 = new Date(now.getTime() - 7 * 86_400_000);
    const [active, total, accepted, recharge, fees, importsFailed, attempts, webhookRows] = await Promise.all([
      this.deps.db.restaurant.count({ where: { status: 'active', orders: { some: { createdAt: { gte: d30 } } } } }),
      this.deps.db.restaurant.count(),
      this.deps.db.order.count({ where: { acceptedAt: { gte: d30 } } }),
      this.deps.db.payment.aggregate({ where: { status: 'succeeded', succeededAt: { gte: d30 }, purpose: { in: ['wallet_recharge', 'flat_plan'] } }, _sum: { amountPaise: true } }),
      this.deps.db.walletLedger.aggregate({ where: { type: 'order_fee', createdAt: { gte: d30 } }, _sum: { amountPaise: true } }),
      this.deps.db.menuImport.count({ where: { status: 'failed', createdAt: { gte: d7 } } }),
      this.deps.db.paymentAttempt.groupBy({ by: ['provider', 'status'], where: { createdAt: { gte: d7 } }, _count: { _all: true } }),
      this.deps.db.webhookEvent.findMany({ where: { createdAt: { gte: d7 }, processedAt: { not: null } }, select: { provider: true, createdAt: true, payload: true }, take: 2000 }),
    ]);
    const providers = new Map<string, { ok: number; total: number }>();
    for (const a of attempts) {
      const p = providers.get(a.provider) ?? { ok: 0, total: 0 };
      if (a.status === 'succeeded') p.ok += a._count._all;
      if (a.status === 'succeeded' || a.status === 'failed') p.total += a._count._all;
      providers.set(a.provider, p);
    }
    const delays = new Map<string, number[]>();
    for (const w of webhookRows) {
      const createdAtSec = (w.payload as { created_at?: number; created?: number })?.created_at ?? (w.payload as { created?: number })?.created;
      if (!createdAtSec) continue;
      const list = delays.get(w.provider) ?? [];
      list.push(Math.max(0, w.createdAt.getTime() - createdAtSec * 1000));
      delays.set(w.provider, list);
    }
    return {
      activeRestaurants: active,
      totalRestaurants: total,
      acceptedOrders30d: accepted,
      rechargeVolume30dPaise: recharge._sum.amountPaise ?? 0,
      feeRevenue30dPaise: -(fees._sum.amountPaise ?? 0),
      importsFailed7d: importsFailed,
      providerHealth: [...providers.entries()].map(([provider, p]) => {
        const d = delays.get(provider);
        return { provider, attempts: p.total, successRate: p.total ? p.ok / p.total : 1, avgWebhookDelayMs: d?.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null };
      }),
    };
  }

  async auditLogs(q: { action?: string; restaurantId?: string; limit: number; cursor?: string }) {
    const rows = await this.deps.db.auditLog.findMany({
      where: { ...(q.action ? { action: { startsWith: q.action } } : {}), ...(q.restaurantId ? { restaurantId: q.restaurantId } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { actor: { select: { email: true, name: true } } },
    });
    const page = rows.slice(0, q.limit);
    return {
      items: page.map((l) => ({ id: l.id, actor: l.actor, action: l.action, entityType: l.entityType, entityId: l.entityId, restaurantId: l.restaurantId, before: l.before, after: l.after, createdAt: l.createdAt.toISOString() })),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
    };
  }
}

function stripMeta<T extends { id: string; createdAt: Date; updatedAt: Date; restaurantId: string | null }>(row: T) {
  const { id: _id, createdAt: _c, updatedAt: _u, restaurantId: _r, ...rest } = row;
  return rest;
}
