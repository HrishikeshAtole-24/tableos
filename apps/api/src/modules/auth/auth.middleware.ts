import type { RequestHandler } from 'express';
import type { Db } from '@tableos/db';
import { type Role, normalisePhone, restaurantIdHeader } from '@tableos/schemas';
import type { AuthUser, Deps } from '../../context';
import { forbidden, unauthorized } from '../../lib/errors';
import { type SupabaseClaims, type SupabaseVerifier, verifySessionToken } from './tokens';

export const SESSION_IDLE_MS = 4 * 60 * 60 * 1000;

/**
 * Upsert the profile row for a Supabase user. Identifiers present in the access token are
 * confirmed by Supabase (OTP or change confirmation), so they are stored as verified.
 * An identifier that now belongs to another profile is not copied (duplicate guard).
 */
export async function syncUser(db: Db, claims: SupabaseClaims, now: Date): Promise<AuthUser> {
  const email = claims.email ? claims.email.toLowerCase() : null;
  const phone = claims.phone ? normalisePhone(claims.phone) : null;
  const existing = await db.user.findUnique({ where: { id: claims.sub } });

  const taken = async (field: 'email' | 'phone', value: string | null) => {
    if (!value) return false;
    const other = await db.user.findFirst({ where: { [field]: value, NOT: { id: claims.sub } }, select: { id: true } });
    return Boolean(other);
  };
  const emailOk = email && !(await taken('email', email)) ? email : null;
  const phoneOk = phone && !(await taken('phone', phone)) ? phone : null;

  let user;
  if (!existing) {
    user = await db.user.create({
      data: {
        id: claims.sub,
        email: emailOk,
        emailVerifiedAt: emailOk ? now : null,
        phone: phoneOk,
        phoneVerifiedAt: phoneOk ? now : null,
        name: claims.user_metadata?.full_name ?? claims.user_metadata?.name ?? null,
      },
    });
  } else {
    const data: Record<string, unknown> = {};
    if (emailOk && existing.email !== emailOk) Object.assign(data, { email: emailOk, emailVerifiedAt: now });
    if (emailOk && existing.email === emailOk && !existing.emailVerifiedAt) data.emailVerifiedAt = now;
    if (phoneOk && existing.phone !== phoneOk) Object.assign(data, { phone: phoneOk, phoneVerifiedAt: now });
    if (phoneOk && existing.phone === phoneOk && !existing.phoneVerifiedAt) data.phoneVerifiedAt = now;
    user = Object.keys(data).length ? await db.user.update({ where: { id: existing.id }, data }) : existing;
  }

  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    emailVerified: Boolean(user.emailVerifiedAt),
    phoneVerified: Boolean(user.phoneVerifiedAt),
    isPlatformAdmin: user.isPlatformAdmin,
    aal: claims.aal ?? 'aal1',
  };
}

export function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

export function requireUser(deps: Deps, verifier: SupabaseVerifier): RequestHandler {
  return async (req, _res, next) => {
    const token = bearer(req.headers.authorization);
    if (!token) throw unauthorized();
    let claims: SupabaseClaims;
    try {
      claims = await verifier.verify(token);
    } catch {
      throw unauthorized('Your session has expired. Sign in again.');
    }
    req.ctx.user = await syncUser(deps.db, claims, deps.clock());
    req.ctx.log = req.ctx.log.child({ userId: req.ctx.user.id });
    next();
  };
}

/**
 * Resolve the active restaurant from the X-Restaurant-Id header and check membership
 * (tenant isolation layer 1). Platform admins get read access through support routes only.
 */
export function requireRestaurant(deps: Deps, roles?: readonly Role[]): RequestHandler {
  return async (req, _res, next) => {
    const user = req.ctx.user;
    if (!user) throw unauthorized();
    const restaurantId = req.header(restaurantIdHeader);
    if (!restaurantId || !/^[0-9a-f-]{36}$/i.test(restaurantId)) throw forbidden('Choose a restaurant first');
    const membership = await deps.db.membership.findUnique({
      where: { userId_restaurantId: { userId: user.id, restaurantId } },
      select: { role: true, restaurant: { select: { status: true } } },
    });
    if (!membership) {
      // Support access: platform admins may open any dashboard read-only; every access is logged.
      if (user.isPlatformAdmin && req.method === 'GET') {
        await deps.db.auditLog.create({
          data: { actorUserId: user.id, restaurantId, action: 'support.access', entityType: 'route', entityId: req.originalUrl.slice(0, 200), ip: req.ctx.ip },
        });
        req.ctx.restaurantId = restaurantId;
        req.ctx.role = 'manager';
        req.ctx.log = req.ctx.log.child({ restaurantId, support: true });
        return next();
      }
      throw forbidden();
    }
    if (membership.restaurant.status === 'closed') throw forbidden('This restaurant account is closed');
    if (roles && !roles.includes(membership.role)) throw forbidden('Your role cannot do this');
    req.ctx.restaurantId = restaurantId;
    req.ctx.role = membership.role;
    req.ctx.log = req.ctx.log.child({ restaurantId });
    next();
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.ctx.role || !roles.includes(req.ctx.role)) throw forbidden('Your role cannot do this');
    next();
  };
}

/** Platform admin with a verified second factor (Supabase MFA, aal2). */
export function requirePlatformAdmin(deps: Deps): RequestHandler {
  return (req, _res, next) => {
    const u = req.ctx.user;
    if (!u?.isPlatformAdmin) throw forbidden();
    if (deps.env.NODE_ENV === 'production' && u.aal !== 'aal2') {
      throw forbidden('Verify your second factor to use platform admin');
    }
    next();
  };
}

/** Diner table-session token from the X-Session-Token header. */
export function requireDinerSession(deps: Deps): RequestHandler {
  return async (req, _res, next) => {
    const token = req.header('x-session-token');
    if (!token) throw unauthorized('Scan the QR code on your table to start');
    let claims;
    try {
      claims = await verifySessionToken(deps.env.SESSION_JWT_SECRET, token);
    } catch {
      throw unauthorized('This table session has ended. Scan the QR code again.');
    }
    const session = await deps.db.tableSession.findUnique({
      where: { id: claims.sid },
      select: { id: true, status: true, restaurantId: true, tableId: true, lastActivityAt: true },
    });
    const now = deps.clock();
    if (
      !session ||
      session.restaurantId !== claims.rid ||
      session.status === 'closed' ||
      now.getTime() - session.lastActivityAt.getTime() > SESSION_IDLE_MS
    ) {
      throw unauthorized('This table session has ended. Scan the QR code again.');
    }
    req.ctx.diner = { sessionId: session.id, restaurantId: session.restaurantId, tableId: session.tableId };
    next();
  };
}
