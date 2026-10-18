import { beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, idem, setupRestaurant, startSession, type TestCtx } from './helpers';

let t: TestCtx;
let A: Awaited<ReturnType<typeof setupRestaurant>>;
let B: Awaited<ReturnType<typeof setupRestaurant>>;
let bOrderId: string;
let bSessionId: string;

beforeAll(async () => {
  t = buildTestApp();
  A = await setupRestaurant(t);
  B = await setupRestaurant(t);
  const s = await startSession(t, B.qr);
  bSessionId = s.sessionId;
  const o = await t.api.post('/v1/public/orders').set({ 'X-Session-Token': s.token, ...idem() }).send({ lines: [{ itemId: B.dal.id, qty: 1 }] }).expect(201);
  bOrderId = o.body.id;
});

/**
 * Spec §3.12: for every dashboard endpoint, a user of restaurant A gets 403 or 404 on
 * restaurant B's data. Two attack shapes: (1) A's user sends B's id in the tenant header;
 * (2) A's user stays in A's tenant but targets B's resource ids.
 */
describe('tenant isolation', () => {
  const routes = (): Array<[string, string, unknown?]> => [
    ['get', '/v1/restaurant'],
    ['get', `/v1/restaurants/${B.rid}`],
    ['patch', `/v1/restaurants/${B.rid}`, { name: 'Hacked' }],
    ['get', '/v1/restaurant/checklist'],
    ['get', '/v1/staff'],
    ['post', '/v1/staff/invites', { email: 'x@y.in', role: 'waiter' }],
    ['get', '/v1/menu'],
    ['post', '/v1/menu/categories', { name: 'X' }],
    ['patch', `/v1/menu/categories/${B.categoryId}`, { name: 'X' }],
    ['delete', `/v1/menu/categories/${B.categoryId}`],
    ['post', '/v1/menu/items', { categoryId: B.categoryId, name: 'X', basePricePaise: 1000 }],
    ['patch', `/v1/menu/items/${B.dal.id}`, { name: 'X' }],
    ['delete', `/v1/menu/items/${B.dal.id}`],
    ['patch', `/v1/menu/items/${B.dal.id}/availability`, { available: false }],
    ['post', '/v1/menu/bulk-price', { itemIds: [B.dal.id], mode: 'amount', value: 100 }],
    ['get', '/v1/menu/imports'],
    ['get', '/v1/tables'],
    ['patch', `/v1/tables/${B.table.id}`, { label: 'X' }],
    ['post', `/v1/tables/${B.table.id}/rotate-qr`],
    ['get', '/v1/orders'],
    ['get', '/v1/orders/live'],
    ['patch', `/v1/orders/${bOrderId}/status`, { status: 'accepted' }],
    ['get', '/v1/service-requests'],
    ['get', `/v1/sessions/${bSessionId}/bill`],
    ['post', `/v1/sessions/${bSessionId}/bill/discount`, { discountPaise: 100 }],
    ['post', `/v1/sessions/${bSessionId}/bill/paid`, { paidVia: 'cash' }],
    ['post', `/v1/sessions/${bSessionId}/close`, {}],
    ['get', '/v1/wallet'],
    ['get', '/v1/wallet/ledger'],
    ['get', '/v1/wallet/invoices'],
    ['get', '/v1/insights'],
  ];

  it("refuses A's user acting with B's tenant header", async () => {
    for (const [method, path, body] of routes()) {
      const req = (t.api as unknown as Record<string, (p: string) => import('supertest').Test>)[method]!(path)
        .set({ Authorization: `Bearer ${A.owner.token}`, 'X-Restaurant-Id': B.rid, ...idem() });
      const res = body === undefined ? await req : await req.send(body as object);
      expect([403, 404], `${method.toUpperCase()} ${path} → ${res.status}`).toContain(res.status);
    }
  });

  it("never touches B's rows from A's tenant", async () => {
    const idRoutes = routes().filter(([, p]) => p.includes(B.categoryId) || p.includes(B.dal.id) || p.includes(B.table.id) || p.includes(bOrderId) || p.includes(bSessionId) || p.includes(B.rid));
    for (const [method, path, body] of idRoutes) {
      const req = (t.api as unknown as Record<string, (p: string) => import('supertest').Test>)[method]!(path).set(A.H(idem()));
      const res = body === undefined ? await req : await req.send(body as object);
      expect([400, 403, 404], `${method.toUpperCase()} ${path} → ${res.status}`).toContain(res.status);
    }
    // B's data is unchanged.
    const dal = await t.db.menuItem.findUniqueOrThrow({ where: { id: B.dal.id } });
    expect(dal).toMatchObject({ name: 'Dal Tadka', available: true, basePricePaise: 19_900 });
    expect((await t.db.order.findUniqueOrThrow({ where: { id: bOrderId } })).status).toBe('placed');
    expect((await t.db.restaurantTable.findUniqueOrThrow({ where: { id: B.table.id } })).qrVersion).toBe(1);
  });

  it("does not let a diner session of B see A's session data", async () => {
    const sB = await startSession(t, B.qr);
    const res = await t.api.get('/v1/public/sessions/current').set({ 'X-Session-Token': sB.token }).expect(200);
    expect(res.body.restaurant.id).toBe(B.rid);
    // Ordering A's dish with B's session fails as unavailable (not found in B's menu).
    const cross = await t.api.post('/v1/public/orders').set({ 'X-Session-Token': sB.token, ...idem() }).send({ lines: [{ itemId: A.dal.id, qty: 1 }] }).expect(422);
    expect(cross.body.code).toBe('items_unavailable');
  });
});
