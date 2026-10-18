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

const BASE = 'https://api.razorpay.com/v1';

interface RzpPayment {
  id: string;
  order_id: string;
  status: string;
  method?: string;
  amount: number;
  created_at: number;
}

/** Razorpay over REST with Basic auth (no SDK), as in the travel project. */
export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay';

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  private async call<T>(creds: ProviderCredentials, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${BASE}${path}`, {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new ProviderError(this.name, `network error: ${(err as Error).message}`, true);
    }
    const data = (await res.json().catch(() => ({}))) as T & { error?: { description?: string; code?: string } };
    if (!res.ok) {
      throw new ProviderError(this.name, data.error?.description ?? `HTTP ${res.status}`, res.status >= 500 || res.status === 429, data);
    }
    return data;
  }

  async createPayment(input: CreatePaymentInput, creds: ProviderCredentials): Promise<CreatePaymentResult> {
    const order = await this.call<{ id: string; status: string; amount: number }>(creds, 'POST', '/orders', {
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.reference,
      notes: { reference: input.reference, ...input.metadata },
    });
    const prefill: Record<string, string> = {};
    if (input.customer.name) prefill.name = input.customer.name;
    if (input.customer.email) prefill.email = input.customer.email;
    if (input.customer.phone) prefill.contact = input.customer.phone;
    return {
      providerRef: order.id,
      status: mapStatus(this.name, order.status),
      rawStatus: order.status,
      checkout: {
        kind: 'razorpay',
        keyId: creds.keyId,
        orderId: order.id,
        amountPaise: order.amount,
        name: 'TableOS',
        description: input.description,
        prefill,
      },
      raw: order,
    };
  }

  async getStatus(providerRef: string, creds: ProviderCredentials): Promise<ProviderStatus> {
    const order = await this.call<{ id: string; status: string; amount_paid: number }>(creds, 'GET', `/orders/${providerRef}`);
    const payments = await this.call<{ items: RzpPayment[] }>(creds, 'GET', `/orders/${providerRef}/payments`);
    const captured = payments.items.find((p) => p.status === 'captured');
    const latest = captured ?? [...payments.items].sort((a, b) => b.created_at - a.created_at)[0];
    const rawStatus = captured ? 'captured' : order.status === 'paid' ? 'paid' : (latest?.status ?? order.status);
    return {
      status: mapStatus(this.name, rawStatus),
      rawStatus,
      providerPaymentId: latest?.id ?? null,
      method: latest?.method ?? null,
      amountPaise: captured?.amount ?? null,
      raw: { order, payments: payments.items },
    };
  }

  async refund(providerRef: string, amountPaise: number, creds: ProviderCredentials): Promise<RefundResult> {
    const status = await this.getStatus(providerRef, creds);
    if (!status.providerPaymentId || status.status !== 'succeeded') {
      throw new ProviderError(this.name, 'No captured payment to refund', false);
    }
    const refund = await this.call<{ id: string; status: string }>(creds, 'POST', `/payments/${status.providerPaymentId}/refund`, {
      amount: amountPaise,
    });
    return { refundId: refund.id, status: refund.status === 'processed' ? 'processed' : refund.status === 'failed' ? 'failed' : 'pending', raw: refund };
  }

  /** X-Razorpay-Signature = hex HMAC-SHA256(raw body, webhook secret). */
  verifyWebhook(headers: Record<string, string>, rawBody: Buffer, creds: ProviderCredentials): WebhookEvent | null {
    const signature = headers['x-razorpay-signature'];
    if (!signature || !safeEqual(signature, hmacSha256(creds.webhookSecret, rawBody))) return null;
    const body = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      created_at?: number;
      payload?: { payment?: { entity: RzpPayment }; order?: { entity: { id: string; status: string } } };
    };
    const payment = body.payload?.payment?.entity;
    const order = body.payload?.order?.entity;
    const rawStatus = payment?.status ?? order?.status ?? null;
    return {
      eventId: headers['x-razorpay-event-id'] ?? `${body.event}:${payment?.id ?? order?.id}:${body.created_at ?? ''}`,
      type: body.event,
      providerRef: payment?.order_id ?? order?.id ?? null,
      providerPaymentId: payment?.id ?? null,
      status: rawStatus ? mapStatus(this.name, rawStatus) : null,
      rawStatus,
      method: payment?.method ?? null,
      amountPaise: payment?.amount ?? null,
      raw: body,
    };
  }

  /** Checkout handler signature: HMAC-SHA256(order_id|payment_id, key secret). */
  verifyCallback(payload: Record<string, string>, creds: ProviderCredentials) {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig } = payload;
    if (!orderId || !paymentId || !sig) return null;
    return safeEqual(sig, hmacSha256(creds.keySecret, `${orderId}|${paymentId}`)) ? { providerRef: orderId, providerPaymentId: paymentId } : null;
  }
}
