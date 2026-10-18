import express, { Router } from 'express';
import { z } from 'zod';
import { formatPaise } from '@tableos/schemas';
import type { Deps } from '../context';
import { badRequest, notFound } from '../lib/errors';
import { json } from '../lib/http';
import { escapeHtml as esc } from '../modules/notifications/mailer';
import type { Checkout } from '../modules/payments/provider';
import { MockProvider } from '../modules/payments/providers/mock';
import type { Services } from '../services';

function page(title: string, body: string, script = ''): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f0f0f5;font-family:Arial,Helvetica,sans-serif;color:#02060c}
.card{background:#fff;border-radius:24px;padding:32px;max-width:380px;width:calc(100% - 32px);box-shadow:0 2px 12px rgba(2,6,12,.08);text-align:center}
.brand{color:#fc8019;font-weight:800;font-size:20px}.amt{font-size:36px;font-weight:800;margin:16px 0 4px}.muted{color:#5c5f66;font-size:14px}
button{width:100%;border:0;border-radius:12px;padding:14px;font-size:16px;font-weight:700;cursor:pointer;margin-top:12px}
.pay{background:#1ba672;color:#fff}.fail{background:#f0f0f5;color:#02060c}
</style></head><body><div class="card">${body}</div>${script}</body></html>`;
}

/**
 * Webhooks (raw body for signature checks) and the hosted checkout bridge pages.
 * Mounted before the JSON body parser.
 */
export function paymentRoutes(deps: Deps, s: Services): Router {
  const r = Router();
  const raw = express.raw({ type: '*/*', limit: '1mb' });

  r.post('/webhooks/:provider/:merchantAccountId', raw, json(async (req) => {
    const provider = z.string().regex(/^[a-z]{2,20}$/).parse(req.params.provider);
    const account = z.union([z.literal('platform'), z.uuid()]).parse(req.params.merchantAccountId);
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0]! : (v ?? '')]));
    const result = await s.payments.handleWebhook(provider, account, headers, Buffer.isBuffer(req.body) ? req.body : Buffer.from(''));
    return { received: true, result };
  }));

  // Hosted bridge page: opens the provider checkout (Razorpay) or the dev mock checkout.
  r.get('/pay/:reference', async (req, res) => {
    const found = await s.payments.checkoutPage(z.string().max(40).parse(req.params.reference));
    if (!found) throw notFound('Payment');
    const { payment, attempt } = found;
    const checkout = attempt.checkout as Checkout | null;
    res.setHeader('Cache-Control', 'no-store');
    const back = `${deps.env.CONSOLE_URL}/wallet?payment=${encodeURIComponent(payment.reference)}`;
    if (payment.status === 'succeeded') return res.redirect(back);
    if (checkout?.kind === 'redirect') return res.redirect(checkout.url);
    if (checkout?.kind === 'mock') return res.redirect(`/v1/pay/mock/${encodeURIComponent(payment.reference)}`);
    if (checkout?.kind !== 'razorpay') throw notFound('Checkout');
    const opts = {
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amountPaise,
      currency: 'INR',
      name: checkout.name,
      description: checkout.description,
      prefill: checkout.prefill,
      theme: { color: '#FC8019' },
    };
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com; frame-src https://api.razorpay.com https://checkout.razorpay.com; connect-src 'self' https://lumberjack.razorpay.com; img-src * data:; style-src 'unsafe-inline'");
    res.type('html').send(
      page(
        'Complete payment',
        `<div class="brand">TableOS</div><div class="amt">${formatPaise(payment.amountPaise)}</div><div class="muted">${esc(checkout.description)}</div><button class="pay" id="pay">Pay securely</button><p class="muted" id="msg"></p>`,
        `<script src="https://checkout.razorpay.com/v1/checkout.js"></script><script>
const opts=${JSON.stringify(opts).replace(/</g, '\\u003c')};const back=${JSON.stringify(back)};
opts.handler=async function(r){document.getElementById('msg').textContent='Confirming payment…';
try{await fetch('/v1/payments/${encodeURIComponent(payment.reference)}/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(r)});}catch(e){}
location.href=back;};
opts.modal={ondismiss:function(){location.href=back+'&cancelled=1';}};
const rzp=new Razorpay(opts);document.getElementById('pay').onclick=function(){rzp.open();};rzp.open();
</script>`,
      ),
    );
  });

  // Browser callback after Razorpay checkout: signature check + server-side status poll.
  r.post('/payments/:reference/verify', express.json({ limit: '16kb' }), json(async (req) => {
    const body = z.record(z.string(), z.string()).parse(req.body ?? {});
    const p = await s.payments.verifyCallback(z.string().max(40).parse(req.params.reference), body);
    return { status: p.status };
  }));

  // Development mock checkout (never registered in production).
  if (deps.env.NODE_ENV !== 'production' && deps.providers.has('mock')) {
    const mock = deps.providers.get('mock') as MockProvider;
    r.get('/pay/mock/:reference', async (req, res) => {
      const found = await s.payments.checkoutPage(z.string().max(40).parse(req.params.reference));
      if (!found) throw notFound('Payment');
      // form-action also governs the redirect after submit, so the console origin must be allowed.
      res.setHeader('Content-Security-Policy', `default-src 'self'; style-src 'unsafe-inline'; form-action 'self' ${deps.env.CONSOLE_URL}`);
      res.type('html').send(
        page(
          'Test payment',
          `<div class="brand">TableOS · Test checkout</div><div class="amt">${formatPaise(found.payment.amountPaise)}</div><div class="muted">Reference ${esc(found.payment.reference)}</div>
<form method="post"><input type="hidden" name="outcome" value="success"><button class="pay">Pay (simulate success)</button></form>
<form method="post"><input type="hidden" name="outcome" value="failure"><button class="fail">Simulate failure</button></form>`,
        ),
      );
    });
    r.post('/pay/mock/:reference', express.urlencoded({ extended: false }), async (req, res) => {
      const reference = z.string().max(40).parse(req.params.reference);
      const outcome = z.enum(['success', 'failure']).parse(req.body?.outcome);
      const found = await s.payments.checkoutPage(reference);
      if (!found?.attempt.providerRef) throw notFound('Payment');
      mock.settle(found.attempt.providerRef, outcome);
      const creds = await s.paymentRouter.credsForAttempt(found.attempt.merchantAccountId, 'mock');
      const hook = creds ? mock.buildWebhook(found.attempt.providerRef, creds) : null;
      if (!hook) throw badRequest('Mock payment not found');
      await s.payments.handleWebhook('mock', found.attempt.merchantAccountId ?? 'platform', { 'x-mock-signature': hook.signature }, Buffer.from(hook.body));
      res.redirect(`${deps.env.CONSOLE_URL}/wallet?payment=${encodeURIComponent(reference)}`);
    });
  }

  return r;
}
