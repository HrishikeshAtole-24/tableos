import { hmacSha256, safeEqual } from '../../../lib/crypto';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  ProviderCredentials,
  ProviderStatus,
  RefundResult,
  WebhookEvent,
} from '../provider';
import { mapStatus } from '../status-map';

interface MockRecord {
  reference: string;
  amountPaise: number;
  status: string;
  paymentId: string | null;
}

/**
 * Local/dev and test provider. Checkout is our own page with "Pay" and "Fail" buttons; it
 * posts a signed webhook exactly like a real provider so the full flow is exercised.
 */
export class MockProvider implements PaymentProvider {
  readonly name = 'mock';
  private readonly store = new Map<string, MockRecord>();
  failNextCreate = false;

  constructor(private readonly checkoutBaseUrl: string) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new Error('mock create failure');
    }
    const ref = `mock_${input.reference}`;
    this.store.set(ref, { reference: input.reference, amountPaise: input.amountPaise, status: 'created', paymentId: null });
    return {
      providerRef: ref,
      status: 'pending',
      rawStatus: 'created',
      checkout: { kind: 'mock', url: `${this.checkoutBaseUrl}/v1/pay/mock/${encodeURIComponent(input.reference)}` },
      raw: { ref },
    };
  }

  /** Test/dev helper: settle a mock payment. */
  settle(providerRef: string, outcome: 'success' | 'failure'): MockRecord | null {
    const rec = this.store.get(providerRef) ?? null;
    if (rec) {
      rec.status = outcome;
      rec.paymentId = `mockpay_${Date.now().toString(36)}`;
    }
    return rec;
  }

  /** Builds the webhook body + signature a real provider would send. */
  buildWebhook(providerRef: string, creds: ProviderCredentials): { body: string; signature: string } | null {
    const rec = this.store.get(providerRef);
    if (!rec) return null;
    const body = JSON.stringify({
      id: `evt_${providerRef}_${rec.status}`,
      type: `payment.${rec.status}`,
      providerRef,
      paymentId: rec.paymentId,
      status: rec.status,
      amount: rec.amountPaise,
    });
    return { body, signature: hmacSha256(creds.webhookSecret, body) };
  }

  async getStatus(providerRef: string): Promise<ProviderStatus> {
    const rec = this.store.get(providerRef);
    const rawStatus = rec?.status ?? 'pending';
    return {
      status: mapStatus(this.name, rawStatus),
      rawStatus,
      providerPaymentId: rec?.paymentId ?? null,
      method: rec?.paymentId ? 'upi' : null,
      amountPaise: rawStatus === 'success' ? (rec?.amountPaise ?? null) : null,
      raw: rec ?? null,
    };
  }

  async refund(providerRef: string): Promise<RefundResult> {
    const rec = this.store.get(providerRef);
    if (rec) rec.status = 'refunded';
    return { refundId: `rfnd_${providerRef}`, status: 'processed', raw: rec ?? null };
  }

  verifyWebhook(headers: Record<string, string>, rawBody: Buffer, creds: ProviderCredentials): WebhookEvent | null {
    const sig = headers['x-mock-signature'];
    if (!sig || !safeEqual(sig, hmacSha256(creds.webhookSecret, rawBody))) return null;
    const e = JSON.parse(rawBody.toString('utf8')) as { id: string; type: string; providerRef: string; paymentId: string | null; status: string; amount: number };
    return {
      eventId: e.id,
      type: e.type,
      providerRef: e.providerRef,
      providerPaymentId: e.paymentId,
      status: mapStatus(this.name, e.status),
      rawStatus: e.status,
      method: 'upi',
      amountPaise: e.amount,
      raw: e,
    };
  }
}
