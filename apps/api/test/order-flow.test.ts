import { beforeAll, describe, expect, it } from 'vitest';
import { addMember, buildTestApp, idem, setupRestaurant, startSession, type TestCtx } from './helpers';

let t: TestCtx;
beforeAll(() => {
  t = buildTestApp();
});

describe('full order flow', () => {
  it('scan → order → accept (fee charged) → kitchen → served → bill → paid', async () => {
    const r = await setupRestaurant(t);
    await t.db.wallet.update({ where: { restaurantId: r.rid }, data: { balancePaise: 1_000 } });
    const kitchen = await addMember(t, r.rid, 'kitchen');
    const waiter = await addMember(t, r.rid, 'waiter');

    // Public menu is available without login.
    const slug = (await t.api.get('/v1/restaurant').set(r.H())).body.slug;
    const menu = await t.api.get(`/v1/public/restaurants/${slug}/menu`).expect(200);
    expect(menu.body.categories[0].items).toHaveLength(2);

    const s = await startSession(t, r.qr);
    expect(s.body.table.label).toBe('T1');

    // Client prices are ignored; the server re-prices from the database.
    const placed = await t.api
      .post('/v1/public/orders')
      .set({ 'X-Session-Token': s.token, ...idem() })
      .send({
        lines: [
          { itemId: r.dal.id, qty: 2 },
          { itemId: r.biryani.id, variantId: r.biryani.variants[1].id, addonIds: [r.biryani.addonGroups[0].addons[0].id], qty: 1, note: 'less spicy' },
        ],
        unitPricePaise: 1,
      })
      .expect(201);
    expect(placed.body.status).toBe('placed'); // first order waits for staff
    expect(placed.body.subtotalPaise).toBe(2 * 19_900 + 79_900 + 4_000);
    expect(placed.body.taxPaise).toBe(Math.round((2 * 19_900 * 500) / 10_000) + Math.round((83_900 * 500) / 10_000));
    expect(placed.body.number).toBe(1);
    expect(t.realtime.events.some((e) => e.event === 'order.created' && e.rooms.some((x) => x.endsWith(':kitchen')))).toBe(true);

    // Kitchen cannot accept; waiter can. Acceptance charges ₹2 in the same transaction.
    await t.api.patch(`/v1/orders/${placed.body.id}/status`).set(kitchen.H()).send({ status: 'accepted' }).expect(403);
    const accepted = await t.api.patch(`/v1/orders/${placed.body.id}/status`).set(waiter.H()).send({ status: 'accepted' }).expect(200);
    expect(accepted.body.status).toBe('accepted');
    const order = await t.db.order.findUniqueOrThrow({ where: { id: placed.body.id } });
    expect(order.feeChargedPaise).toBe(200);
    expect((await t.db.wallet.findUniqueOrThrow({ where: { restaurantId: r.rid } })).balancePaise).toBe(800);
    const ledger = await t.db.walletLedger.findMany({ where: { restaurantId: r.rid, type: 'order_fee' } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.balanceAfterPaise).toBe(800);

    // Second round is accepted automatically.
    const second = await t.api.post('/v1/public/orders').set({ 'X-Session-Token': s.token, ...idem() }).send({ lines: [{ itemId: r.dal.id, qty: 1 }] }).expect(201);
    expect(second.body.status).toBe('accepted');
    expect(second.body.number).toBe(2);

    await t.api.patch(`/v1/orders/${placed.body.id}/status`).set(kitchen.H()).send({ status: 'preparing' }).expect(200);
    await t.api.patch(`/v1/orders/${placed.body.id}/status`).set(kitchen.H()).send({ status: 'ready' }).expect(200);
    await t.api.patch(`/v1/orders/${placed.body.id}/status`).set(kitchen.H()).send({ status: 'served' }).expect(403);
    await t.api.patch(`/v1/orders/${placed.body.id}/status`).set(waiter.H()).send({ status: 'served' }).expect(200);
    await t.api.patch(`/v1/orders/${placed.body.id}/status`).set(waiter.H()).send({ status: 'preparing' }).expect(422);

    // Item removal is blocked once preparing.
    const itemId = accepted.body.items[0].id;
    await t.api.delete(`/v1/orders/${placed.body.id}/items/${itemId}`).set(waiter.H()).expect(422);

    // Diner view of the session and bill.
    const current = await t.api.get('/v1/public/sessions/current').set({ 'X-Session-Token': s.token }).expect(200);
    expect(current.body.orders).toHaveLength(2);

    const bill = await t.api.get(`/v1/sessions/${s.sessionId}/bill`).set(waiter.H()).expect(200);
    const expectedSubtotal = 2 * 19_900 + 83_900 + 19_900;
    expect(bill.body.subtotalPaise).toBe(expectedSubtotal);
    expect(bill.body.totalPaise % 100).toBe(0);
    expect(bill.body.subtotalPaise + bill.body.taxPaise + bill.body.roundOffPaise).toBe(bill.body.totalPaise);

    await t.api.post(`/v1/sessions/${s.sessionId}/bill/discount`).set(waiter.H()).send({ discountPaise: 5_000 }).expect(403);
    const discounted = await t.api.post(`/v1/sessions/${s.sessionId}/bill/discount`).set(r.H()).send({ discountPaise: 5_000, reason: 'Regular guest' }).expect(200);
    expect(discounted.body.discountPaise).toBe(5_000);

    const paid = await t.api.post(`/v1/sessions/${s.sessionId}/bill/paid`).set(waiter.H()).send({ paidVia: 'upi' }).expect(200);
    expect(paid.body.status).toBe('paid');
    expect(paid.body.paidVia).toBe('upi');

    // The session is closed: the diner token stops working.
    await t.api.get('/v1/public/sessions/current').set({ 'X-Session-Token': s.token }).expect(401);
    // A new scan starts a fresh session.
    const fresh = await startSession(t, r.qr);
    expect(fresh.sessionId).not.toBe(s.sessionId);
  });

  it('replays an order with the same Idempotency-Key and rejects a changed body', async () => {
    const r = await setupRestaurant(t);
    const s = await startSession(t, r.qr);
    const key = idem();
    const body = { lines: [{ itemId: r.dal.id, qty: 1 }] };
    const a = await t.api.post('/v1/public/orders').set({ 'X-Session-Token': s.token, ...key }).send(body).expect(201);
    const b = await t.api.post('/v1/public/orders').set({ 'X-Session-Token': s.token, ...key }).send(body).expect(201);
    expect(b.body.id).toBe(a.body.id);
    expect(await t.db.order.count({ where: { sessionId: s.sessionId } })).toBe(1);
    await t.api.post('/v1/public/orders').set({ 'X-Session-Token': s.token, ...key }).send({ lines: [{ itemId: r.dal.id, qty: 2 }] }).expect(422);
    await t.api.post('/v1/public/orders').set({ 'X-Session-Token': s.token }).send(body).expect(400);
  });

  it('fails the whole order when a dish is sold out and lists it', async () => {
    const r = await setupRestaurant(t);
    await t.api.patch(`/v1/menu/items/${r.dal.id}/availability`).set(r.H()).send({ available: false }).expect(204);
    expect(t.realtime.events.some((e) => e.event === 'menu.availability')).toBe(true);
    const s = await startSession(t, r.qr);
    const res = await t.api
      .post('/v1/public/orders')
      .set({ 'X-Session-Token': s.token, ...idem() })
      .send({ lines: [{ itemId: r.dal.id, qty: 1 }, { itemId: r.biryani.id, variantId: r.biryani.variants[0].id, qty: 1 }] })
      .expect(422);
    expect(res.body.code).toBe('items_unavailable');
    expect(res.body.details.unavailable).toEqual([{ itemId: r.dal.id, name: 'Dal Tadka' }]);
  });

  it('validates variants and add-on limits', async () => {
    const r = await setupRestaurant(t);
    const s = await startSession(t, r.qr);
    const post = (line: Record<string, unknown>) => t.api.post('/v1/public/orders').set({ 'X-Session-Token': s.token, ...idem() }).send({ lines: [line] });
    expect((await post({ itemId: r.biryani.id, qty: 1 })).body.code).toBe('variant_required');
    const ids = r.biryani.addonGroups[0].addons.map((a: { id: string }) => a.id);
    expect((await post({ itemId: r.biryani.id, variantId: r.biryani.variants[0].id, addonIds: [...ids, r.dal.id], qty: 1 })).body.code).toBe('invalid_addons');
  });

  it('auto-accepts when first-order acceptance is off and limits orders per session', async () => {
    const r = await setupRestaurant(t, { requireFirstOrderAcceptance: false });
    const s = await startSession(t, r.qr);
    const first = await t.api.post('/v1/public/orders').set({ 'X-Session-Token': s.token, ...idem() }).send({ lines: [{ itemId: r.dal.id, qty: 1 }] }).expect(201);
    expect(first.body.status).toBe('accepted');
    for (let i = 0; i < 9; i++) await t.api.post('/v1/public/orders').set({ 'X-Session-Token': s.token, ...idem() }).send({ lines: [{ itemId: r.dal.id, qty: 1 }] }).expect(201);
    const blocked = await t.api.post('/v1/public/orders').set({ 'X-Session-Token': s.token, ...idem() }).send({ lines: [{ itemId: r.dal.id, qty: 1 }] }).expect(429);
    expect(blocked.body.code).toBe('rate_limited');
  });

  it('rejects with a reason and never charges for it', async () => {
    const r = await setupRestaurant(t);
    const s = await startSession(t, r.qr);
    const o = await t.api.post('/v1/public/orders').set({ 'X-Session-Token': s.token, ...idem() }).send({ lines: [{ itemId: r.dal.id, qty: 1 }] }).expect(201);
    await t.api.patch(`/v1/orders/${o.body.id}/status`).set(r.H()).send({ status: 'rejected' }).expect(400);
    const rej = await t.api.patch(`/v1/orders/${o.body.id}/status`).set(r.H()).send({ status: 'rejected', reason: 'Kitchen closing' }).expect(200);
    expect(rej.body.rejectReason).toBe('Kitchen closing');
    expect(await t.db.walletLedger.count({ where: { restaurantId: r.rid, type: 'order_fee' } })).toBe(0);
  });

  it('enforces the 60-second service request cooldown on the server', async () => {
    const r = await setupRestaurant(t);
    const s = await startSession(t, r.qr);
    await t.api.post('/v1/public/service-requests').set({ 'X-Session-Token': s.token }).send({ type: 'water' }).expect(201);
    await t.api.post('/v1/public/service-requests').set({ 'X-Session-Token': s.token }).send({ type: 'water' }).expect(429);
    await t.api.post('/v1/public/service-requests').set({ 'X-Session-Token': s.token }).send({ type: 'waiter' }).expect(201);
    t.clock.now = new Date(t.clock.now.getTime() + 61_000);
    await t.api.post('/v1/public/service-requests').set({ 'X-Session-Token': s.token }).send({ type: 'water' }).expect(201);
    const open = await t.api.get('/v1/service-requests').set(r.H()).expect(200);
    expect(open.body).toHaveLength(3);
    await t.api.patch(`/v1/service-requests/${open.body[0].id}/ack`).set(r.H()).expect(200);
  });

  it('lets staff order for a table and rotating the QR invalidates old codes', async () => {
    const r = await setupRestaurant(t);
    const waiter = await addMember(t, r.rid, 'waiter');
    const o = await t.api.post('/v1/orders').set(waiter.H(idem())).send({ tableId: r.table.id, lines: [{ itemId: r.dal.id, qty: 3 }] }).expect(201);
    expect(o.body.status).toBe('accepted');
    expect(o.body.placedBy).toBe('staff');
    await t.api.post(`/v1/tables/${r.table.id}/rotate-qr`).set(r.H()).expect(200);
    const res = await t.api.post('/v1/public/sessions').send({ qr: r.qr }).expect(404);
    expect(res.body.code).toBe('invalid_qr');
  });

  it('pauses ordering when the restaurant turns it off', async () => {
    const r = await setupRestaurant(t);
    const s = await startSession(t, r.qr);
    await t.api.patch(`/v1/restaurants/${r.rid}`).set(r.H()).send({ orderingEnabled: false }).expect(200);
    const res = await t.api.post('/v1/public/orders').set({ 'X-Session-Token': s.token, ...idem() }).send({ lines: [{ itemId: r.dal.id, qty: 1 }] }).expect(422);
    expect(res.body.code).toBe('ordering_unavailable');
  });
});
