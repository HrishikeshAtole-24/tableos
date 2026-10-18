import { describe, expect, it, beforeAll } from 'vitest';
import { hmacSha256 } from '../src/lib/crypto';
import { buildTestApp, idem, newUser, setupRestaurant, startSession, tokenFor, type TestCtx } from './helpers';

let t: TestCtx;
beforeAll(() => {
  t = buildTestApp();
});

const WEBHOOK_SECRET = 'test-webhook-secret';

async function recharge(r: Awaited<ReturnType<typeof setupRestaurant>>, amountPaise: number, purpose = 'wallet_recharge') {
  const res = await t.api.post('/v1/wallet/recharges').set(r.H(idem())).send({ amountPaise, purpose });
  return res;
}

function webhookFor(reference: string, outcome: 'success' | 'failure') {
  const providerRef = `mock_${reference}`;
  t.mock.settle(providerRef, outcome);
  return t.mock.buildWebhook(providerRef, { keyId: 'k', keySecret: 's', webhookSecret: WEBHOOK_SECRET })!;
}

describe('wallet recharge through the payment orchestration layer', () => {
  it('rejects recharges below the minimum', async () => {
    const r = await setupRestaurant(t);
    const res = await recharge(r, 10_000);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('recharge_too_small');
  });

  it('credits the wallet once from a verified webhook, ignores replays, and issues a GST invoice', async () => {
    const r = await setupRestaurant(t);
    const created = await recharge(r, 50_000);
    expect(created.status).toBe(201);
    expect(created.body.amountPaise).toBe(59_000); // ₹500 + 18% GST
    expect(created.body.creditPaise).toBe(50_000);
    expect(created.body.checkoutUrl).toContain(`/v1/pay/${created.body.reference}`);

    // The browser redirect never credits: status is still pending.
    const pending = await t.api.get(`/v1/wallet/payments/${created.body.reference}`).set(r.H()).expect(200);
    expect(pending.body.status).toBe('pending');

    // A forged webhook is refused.
    const hook = webhookFor(created.body.reference, 'success');
    await t.api.post('/v1/webhooks/mock/platform').set('x-mock-signature', 'bad').set('Content-Type', 'application/json').send(hook.body).expect(400);

    const ok = await t.api.post('/v1/webhooks/mock/platform').set('x-mock-signature', hook.signature).set('Content-Type', 'application/json').send(hook.body).expect(200);
    expect(ok.body.result).toBe('ok');
    const replay = await t.api.post('/v1/webhooks/mock/platform').set('x-mock-signature', hook.signature).set('Content-Type', 'application/json').send(hook.body).expect(200);
    expect(replay.body.result).toBe('duplicate');

    const wallet = await t.api.get('/v1/wallet').set(r.H()).expect(200);
    expect(wallet.body.balancePaise).toBe(50_000);
    expect(await t.db.walletLedger.count({ where: { restaurantId: r.rid, type: 'recharge' } })).toBe(1);

    const invoices = await t.api.get('/v1/wallet/invoices').set(r.H()).expect(200);
    expect(invoices.body).toHaveLength(1);
    expect(invoices.body[0]).toMatchObject({ amountPaise: 50_000, gstPaise: 9_000, totalPaise: 59_000 });
    expect(invoices.body[0].number).toMatch(/^TOS\/\d{4}-\d{2}\/\d{6}$/);
    const html = await t.api.get(`/v1/wallet/invoices/${invoices.body[0].id}`).set(r.H()).expect(200);
    expect(html.text).toContain('Tax invoice');
    expect(t.jobs.sent.some((j) => j.data.template === 'recharge_receipt')).toBe(true);
  });

  it('applies a reconciliation poll exactly once even when the webhook also arrives', async () => {
    const r = await setupRestaurant(t);
    const created = await recharge(r, 20_000);
    const hook = webhookFor(created.body.reference, 'success');
    await t.services.payments.reconcileOne(created.body.paymentId);
    await t.api.post('/v1/webhooks/mock/platform').set('x-mock-signature', hook.signature).set('Content-Type', 'application/json').send(hook.body).expect(200);
    expect((await t.db.wallet.findUniqueOrThrow({ where: { restaurantId: r.rid } })).balancePaise).toBe(20_000);
  });

  it('marks failed payments without crediting and falls back to the next provider on create failure', async () => {
    const r = await setupRestaurant(t);
    const created = await recharge(r, 20_000);
    const hook = webhookFor(created.body.reference, 'failure');
    await t.api.post('/v1/webhooks/mock/platform').set('x-mock-signature', hook.signature).set('Content-Type', 'application/json').send(hook.body).expect(200);
    const p = await t.api.get(`/v1/wallet/payments/${created.body.reference}`).set(r.H()).expect(200);
    expect(p.body.status).toBe('failed');
    expect((await t.db.wallet.findUniqueOrThrow({ where: { restaurantId: r.rid } })).balancePaise).toBe(0);

    t.mock.failNextCreate = true;
    const res = await recharge(r, 20_000);
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('payment_provider_unavailable');
  });

  it('a recharge clears a negative balance and switches ordering back on at once', async () => {
    const r = await setupRestaurant(t);
    await t.db.wallet.update({ where: { restaurantId: r.rid }, data: { balancePaise: -5_000, zeroReachedAt: t.clock.now, orderingPaused: true } });
    const s = await startSession(t, r.qr);
    const blocked = await t.api.post('/v1/public/orders').set({ 'X-Session-Token': s.token, ...idem() }).send({ lines: [{ itemId: r.dal.id, qty: 1 }] }).expect(422);
    expect(blocked.body.details.reason).toBe('wallet_paused');

    const created = await recharge(r, 20_000);
    const hook = webhookFor(created.body.reference, 'success');
    await t.api.post('/v1/webhooks/mock/platform').set('x-mock-signature', hook.signature).set('Content-Type', 'application/json').send(hook.body).expect(200);
    const w = await t.db.wallet.findUniqueOrThrow({ where: { restaurantId: r.rid } });
    expect(w).toMatchObject({ balancePaise: 15_000, orderingPaused: false, zeroReachedAt: null });
    await t.api.post('/v1/public/orders').set({ 'X-Session-Token': s.token, ...idem() }).send({ lines: [{ itemId: r.dal.id, qty: 1 }] }).expect(201);
  });

  it('flat plan makes order fees zero until the next IST month boundary', async () => {
    const r = await setupRestaurant(t, { requireFirstOrderAcceptance: false });
    const created = await recharge(r, 0, 'flat_plan').catch(() => null);
    expect(created?.status).toBe(400); // amount must still be a valid positive number
    const plan = await recharge(r, 100, 'flat_plan');
    expect(plan.status).toBe(201);
    expect(plan.body.amountPaise).toBe(99_900 + 17_982);
    const hook = webhookFor(plan.body.reference, 'success');
    await t.api.post('/v1/webhooks/mock/platform').set('x-mock-signature', hook.signature).set('Content-Type', 'application/json').send(hook.body).expect(200);
    const rest = await t.db.restaurant.findUniqueOrThrow({ where: { id: r.rid } });
    expect(rest.plan).toBe('flat');
    expect(rest.flatPlanUntil?.toISOString()).toBe('2026-10-31T18:30:00.000Z');
    const s = await startSession(t, r.qr);
    const o = await t.api.post('/v1/public/orders').set({ 'X-Session-Token': s.token, ...idem() }).send({ lines: [{ itemId: r.dal.id, qty: 1 }] }).expect(201);
    expect((await t.db.order.findUniqueOrThrow({ where: { id: o.body.id } })).feeChargedPaise).toBe(0);
  });
});

describe('metering, alerts and grace', () => {
  it('meters to the cap and records usage', async () => {
    const r = await setupRestaurant(t, { requireFirstOrderAcceptance: false });
    const monthKey = '2026-10';
    await t.db.usageMonth.create({ data: { restaurantId: r.rid, monthKey, acceptedOrders: 499, feesChargedPaise: 99_800 } });
    await t.db.wallet.update({ where: { restaurantId: r.rid }, data: { balancePaise: 10_000 } });
    const s = await startSession(t, r.qr);
    const place = () => t.api.post('/v1/public/orders').set({ 'X-Session-Token': s.token, ...idem() }).send({ lines: [{ itemId: r.dal.id, qty: 1 }] }).expect(201);
    const a = await place();
    const b = await place();
    const fees = await t.db.order.findMany({ where: { id: { in: [a.body.id, b.body.id] } }, select: { id: true, feeChargedPaise: true } });
    expect(fees.find((f) => f.id === a.body.id)!.feeChargedPaise).toBe(100);
    expect(fees.find((f) => f.id === b.body.id)!.feeChargedPaise).toBe(0);
    const w = await t.api.get('/v1/wallet').set(r.H()).expect(200);
    expect(w.body.month).toMatchObject({ acceptedOrders: 501, feesChargedPaise: 99_900, capReached: true });
    expect(w.body.balancePaise).toBe(9_900);
    expect(t.jobs.sent.some((j) => j.name === 'wallet.alerts' && j.data.restaurantId === r.rid)).toBe(true);
  });

  it('pauses ordering only outside opening hours after grace ends', async () => {
    const r = await setupRestaurant(t);
    // Open 11:00–23:00 IST every day.
    const hours = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [{ open: '11:00', close: '23:00' }]]));
    await t.api.patch(`/v1/restaurants/${r.rid}`).set(r.H()).send({ openingHours: hours }).expect(200);
    const zeroAt = new Date('2026-10-12T08:00:00Z');
    await t.db.wallet.update({ where: { restaurantId: r.rid }, data: { balancePaise: -2_000, zeroReachedAt: zeroAt } });

    t.clock.now = new Date('2026-10-14T10:00:00Z'); // 15:30 IST, open, grace over
    expect((await t.services.wallet.runGraceCheck()).paused).not.toContain(r.rid);
    t.clock.now = new Date('2026-10-14T18:00:00Z'); // 23:30 IST, closed
    expect((await t.services.wallet.runGraceCheck()).paused).toContain(r.rid);
    expect((await t.db.wallet.findUniqueOrThrow({ where: { restaurantId: r.rid } })).orderingPaused).toBe(true);

    // The free menu keeps working in view-only mode.
    const slug = (await t.api.get('/v1/restaurant').set(r.H())).body.slug;
    const menu = await t.api.get(`/v1/public/restaurants/${slug}/menu`).expect(200);
    expect(menu.body.restaurant.orderingAvailable).toBe(false);
    expect(menu.body.categories.length).toBeGreaterThan(0);
    t.clock.now = new Date('2026-10-14T08:00:00Z');
  });

  it('admin wallet adjustments need a reason and are audited', async () => {
    const r = await setupRestaurant(t);
    const admin = await newUser('admin');
    await t.db.user.create({ data: { id: admin.id, email: admin.email, isPlatformAdmin: true } });
    const H = { Authorization: `Bearer ${await tokenFor({ id: admin.id, email: admin.email, aal: 'aal2' })}` };
    await t.api.post('/v1/admin/wallet-adjustments').set(H).send({ restaurantId: r.rid, amountPaise: 5_000 }).expect(400);
    const res = await t.api.post('/v1/admin/wallet-adjustments').set(H).send({ restaurantId: r.rid, amountPaise: 5_000, reason: 'Goodwill credit' }).expect(201);
    expect(res.body.balancePaise).toBe(5_000);
    expect(await t.db.auditLog.count({ where: { restaurantId: r.rid, action: 'wallet.adjust' } })).toBe(1);
    // Non-admins are refused.
    await t.api.get('/v1/admin/metrics').set({ Authorization: `Bearer ${r.owner.token}` }).expect(403);
    const metrics = await t.api.get('/v1/admin/metrics').set(H).expect(200);
    expect(metrics.body.totalRestaurants).toBeGreaterThan(0);
  });
});

describe('webhook signature helpers', () => {
  it('verifies the Razorpay signature format', async () => {
    const { RazorpayProvider } = await import('../src/modules/payments/providers/razorpay');
    const p = new RazorpayProvider();
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', status: 'captured', amount: 59000, method: 'upi', created_at: 1 } } } }));
    const creds = { keyId: 'k', keySecret: 'ks', webhookSecret: 'whs' };
    expect(p.verifyWebhook({ 'x-razorpay-signature': 'nope' }, body, creds)).toBeNull();
    const ev = p.verifyWebhook({ 'x-razorpay-signature': hmacSha256('whs', body), 'x-razorpay-event-id': 'evt_1' }, body, creds)!;
    expect(ev).toMatchObject({ eventId: 'evt_1', providerRef: 'order_1', status: 'succeeded', amountPaise: 59000 });
    expect(p.verifyCallback({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: hmacSha256('ks', 'order_1|pay_1') }, creds)).toEqual({ providerRef: 'order_1', providerPaymentId: 'pay_1' });
  });

  it('verifies the Stripe signature with timestamp tolerance', async () => {
    const { StripeProvider } = await import('../src/modules/payments/providers/stripe');
    const p = new StripeProvider();
    const body = JSON.stringify({ id: 'evt_s', type: 'checkout.session.completed', data: { object: { id: 'cs_1', status: 'complete', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 59000 } } });
    const ts = Math.floor(Date.now() / 1000);
    const creds = { keyId: 'k', keySecret: 'sk', webhookSecret: 'whsec' };
    const sig = `t=${ts},v1=${hmacSha256('whsec', `${ts}.${body}`)}`;
    expect(p.verifyWebhook({ 'stripe-signature': sig }, Buffer.from(body), creds)).toMatchObject({ providerRef: 'cs_1', status: 'succeeded' });
    const old = `t=${ts - 1000},v1=${hmacSha256('whsec', `${ts - 1000}.${body}`)}`;
    expect(p.verifyWebhook({ 'stripe-signature': old }, Buffer.from(body), creds)).toBeNull();
  });
});
