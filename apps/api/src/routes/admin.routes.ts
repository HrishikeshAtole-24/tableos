import { Router } from 'express';
import { z } from 'zod';
import { idParam, merchantAccountInput, pricingConfigInput, restaurantStatusInput, uuid, walletAdjustmentInput } from '@tableos/schemas';
import type { Deps } from '../context';
import { json, parse } from '../lib/http';
import { requirePlatformAdmin, requireUser } from '../modules/auth/auth.middleware';
import type { SupabaseVerifier } from '../modules/auth/tokens';
import type { Services } from '../services';

/** /v1/admin: platform admin only, second factor required in production. Every write is audited. */
export function adminRoutes(deps: Deps, s: Services, verifier: SupabaseVerifier): Router {
  const r = Router();
  r.use(requireUser(deps, verifier), requirePlatformAdmin(deps));
  const uid = (req: { ctx: { user?: { id: string } } }) => req.ctx.user!.id;

  r.get('/restaurants', json((req) => {
    const q = parse(z.object({ search: z.string().max(80).optional(), status: z.enum(['pending', 'active', 'suspended', 'closed']).optional(), limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().optional() }), req.query);
    return s.admin.listRestaurants(q);
  }));
  r.get('/restaurants/:id', json((req) => s.admin.getRestaurant(parse(idParam, req.params).id)));
  r.patch('/restaurants/:id/status', json((req) => {
    const b = parse(restaurantStatusInput, req.body);
    return s.admin.setStatus(uid(req), parse(idParam, req.params).id, b.status, b.reason);
  }));
  r.put('/restaurants/:id/feature-flags', json(async (req) => {
    await s.admin.setFeatureFlags(uid(req), parse(idParam, req.params).id, parse(z.object({ flags: z.array(z.string().regex(/^[a-z0-9_]{2,40}$/)).max(30) }), req.body).flags);
  }));

  r.post('/wallet-adjustments', json(async (req) => {
    const b = parse(walletAdjustmentInput, req.body);
    return { balancePaise: await s.wallet.adjust(b.restaurantId, b.amountPaise, b.reason, uid(req)) };
  }, { created: true }));

  r.get('/pricing-config', json((req) => s.admin.getPricingConfig(parse(z.object({ restaurantId: uuid.optional() }), req.query).restaurantId ?? null)));
  r.put('/pricing-config', json((req) => s.admin.updatePricingConfig(uid(req), parse(pricingConfigInput, req.body))));

  r.get('/imports', json((req) => s.admin.listImports(parse(z.object({ status: z.string().optional() }), req.query).status)));
  r.post('/imports/:id/retry', json((req) => s.imports.retry(null, parse(idParam, req.params).id)));

  r.get('/merchant-accounts', json(() => s.admin.listMerchantAccounts()));
  r.post('/merchant-accounts', json((req) => s.admin.createMerchantAccount(uid(req), parse(merchantAccountInput, req.body)), { created: true }));
  r.patch('/merchant-accounts/:id', json(async (req) => {
    await s.admin.setMerchantAccountStatus(uid(req), parse(idParam, req.params).id, parse(z.object({ status: z.enum(['active', 'disabled']) }), req.body).status);
  }));

  r.get('/metrics', json(() => s.admin.metrics()));
  r.get('/audit-logs', json((req) => {
    const q = parse(z.object({ action: z.string().max(60).optional(), restaurantId: uuid.optional(), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().optional() }), req.query);
    return s.admin.auditLogs(q);
  }));

  return r;
}
