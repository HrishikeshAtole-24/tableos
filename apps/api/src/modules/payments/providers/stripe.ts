import { hmacSha256, safeEqual } from '../../../lib/crypto';
import {
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
  type ProviderCredentials,
  type ProviderStatus,
  type RefundResult,
  type WebhookEvent,
  ProviderError,
} from '../provider';
import { mapStatus } from '../status-map';

const BASE = 'https://api.stripe.com/v1';
const TOLERANCE_SECONDS = 300;

interface StripeSession {
  id: string;
  url: string | null;
  status: 'open' | 'complete' | 'expired';
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  payment_intent: string | null;
  amount_total: number | null;
  payment_method_types?: string[];
}

function form(obj: Record<string, string | number>): string {
  return new URLSearchParams(Object.entries(obj).map(([k, v]) => [k, String(v)])).toString();
}

/** Stripe Checkout Sessions over REST (form-encoded, no SDK). */
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  private async call<T>(creds: ProviderCredentials, method: 'GET' | 'POST', path: string, body?: Record<string, string | number>, idempotencyKey?: string): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${creds.keySecret}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        ...(body ? { body: form(body) } : {}),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new ProviderError(this.name, `network error: ${(err as Error).message}`, true);
    }
    const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) throw new ProviderError(this.name, data.error?.message ?? `HTTP ${res.status}`, res.status >= 500 || res.status === 429, data);
    return data;
  }

  private sessionStatus(s: StripeSession): string {
    if (s.status === 'expired') return 'expired';
    if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') return s.payment_status;
    return s.status === 'complete' ? 'unpaid' : 'open';
  }

  async createPayment(input: CreatePaymentInput, creds: ProviderCredentials): Promise<CreatePaymentResult> {
    const body: Record<string, string | number> = {
      mode: 'payment',
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][currency]': 'inr',
      'line_items[0][price_data][unit_amount]': input.amountPaise,
      'line_items[0][price_data][product_data][name]': input.description,
      success_url: input.returnUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.reference,
      'metadata[reference]': input.reference,
      // Stripe requires 30 minutes to 24 hours.
      expires_at: Math.max(Math.floor(input.expiresAt.getTime() / 1000), Math.floor(Date.now() / 1000) + 31 * 60),
    };
    if (input.customer.email) body.customer_email = input.customer.email;
    for (const [k, v] of Object.entries(input.metadata)) body[`metadata[${k}]`] = v;
    const s = await this.call<StripeSession>(creds, 'POST', '/checkout/sessions', body, input.reference);
    const rawStatus = this.sessionStatus(s);
    if (!s.url) throw new ProviderError(this.name, 'Checkout session has no URL', true, s);
    return { providerRef: s.id, status: mapStatus(this.name, rawStatus), rawStatus, checkout: { kind: 'redirect', url: s.url }, raw: s };
  }

  async getStatus(providerRef: string, creds: ProviderCredentials): Promise<ProviderStatus> {
    const s = await this.call<StripeSession>(creds, 'GET', `/checkout/sessions/${providerRef}`);
    const rawStatus = this.sessionStatus(s);
    return {
      status: mapStatus(this.name, rawStatus),
      rawStatus,
      providerPaymentId: s.payment_intent,
      method: s.payment_method_types?.[0] ?? null,
      amountPaise: rawStatus === 'paid' ? s.amount_total : null,
      raw: s,
    };
  }

  async refund(providerRef: string, amountPaise: number, creds: ProviderCredentials): Promise<RefundResult> {
    const s = await this.call<StripeSession>(creds, 'GET', `/checkout/sessions/${providerRef}`);
    if (!s.payment_intent) throw new ProviderError(this.name, 'No payment to refund', false);
    const r = await this.call<{ id: string; status: string }>(creds, 'POST', '/refunds', { payment_intent: s.payment_intent, amount: amountPaise });
    return { refundId: r.id, status: r.status === 'succeeded' ? 'processed' : r.status === 'failed' ? 'failed' : 'pending', raw: r };
  }

  /** Stripe-Signature: t=<ts>,v1=<hex HMAC-SHA256("<ts>.<raw body>")>; 5-minute tolerance. */
  verifyWebhook(headers: Record<string, string>, rawBody: Buffer, creds: ProviderCredentials): WebhookEvent | null {
    const header = headers['stripe-signature'];
    if (!header) return null;
    const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
    const ts = Number(parts.t);
    if (!ts || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return null;
    const expected = hmacSha256(creds.webhookSecret, `${ts}.${rawBody.toString('utf8')}`);
    const candidates = header
      .split(',')
      .filter((kv) => kv.startsWith('v1='))
      .map((kv) => kv.slice(3));
    if (!candidates.some((c) => safeEqual(c, expected))) return null;
    const event = JSON.parse(rawBody.toString('utf8')) as { id: string; type: string; data: { object: StripeSession } };
    const s = event.data.object;
    const rawStatus =
      event.type === 'checkout.session.async_payment_failed' ? 'failed' : event.type === 'checkout.session.expired' ? 'expired' : this.sessionStatus(s);
    return {
      eventId: event.id,
      type: event.type,
      providerRef: s.id,
      providerPaymentId: s.payment_intent,
      status: mapStatus(this.name, rawStatus),
      rawStatus,
      method: s.payment_method_types?.[0] ?? null,
      amountPaise: s.amount_total,
      raw: event,
    };
  }
}
