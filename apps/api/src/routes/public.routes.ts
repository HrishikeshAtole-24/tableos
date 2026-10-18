import { Router } from 'express';
import { z } from 'zod';
import { analyticsBatchInput, createServiceRequestInput, createSessionInput, locale, placeOrderInput } from '@tableos/schemas';
import type { Deps } from '../context';
import { notFound } from '../lib/errors';
import { json, parse } from '../lib/http';
import { idempotent } from '../lib/idempotency';
import { requireDinerSession } from '../modules/auth/auth.middleware';
import type { Services } from '../services';

/** Diner-facing routes. No login; table-session token in X-Session-Token. */
export function publicRoutes(deps: Deps, s: Services): Router {
  const r = Router();
  const diner = requireDinerSession(deps);

  r.get('/restaurants/:slug/menu', json(async (req, res) => {
    const slug = z.string().min(2).max(60).parse(req.params.slug);
    const q = parse(z.object({ locale: locale.default('en') }), req.query);
    const menu = await s.menu.publicMenu(slug, q.locale);
    if (!menu) throw notFound('Restaurant');
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
    return menu;
  }));

  r.post('/sessions', json((req) => s.sessions.start(parse(createSessionInput, req.body).qr), { created: true }));
  r.get('/sessions/current', diner, json((req) => s.sessions.current(req.ctx.diner!.sessionId)));
  r.get('/sessions/current/bill', diner, json((req) => s.billing.forDiner(req.ctx.diner!)));
  r.get('/sessions/current/requests', diner, json((req) => s.serviceRequests.listForSession(req.ctx.diner!.sessionId)));

  r.post(
    '/orders',
    diner,
    idempotent(deps.db, (req) => `order:${req.ctx.diner!.sessionId}`),
    json((req) => s.orders.placeDinerOrder(req.ctx.diner!, parse(placeOrderInput, req.body)), { created: true }),
  );

  r.post('/service-requests', diner, json((req) => s.serviceRequests.create(req.ctx.diner!, parse(createServiceRequestInput, req.body).type), { created: true }));

  r.post('/events', json(async (req) => {
    await s.analytics.ingest(parse(analyticsBatchInput, req.body));
    return { ok: true };
  }));

  return r;
}
