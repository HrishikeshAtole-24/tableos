import type { PaymentStatus } from '@tableos/schemas';

/** Internal payment states (spec §3.7): created → pending → succeeded | failed | expired, succeeded → refunded. */
export type InternalStatus = Extract<PaymentStatus, 'created' | 'pending' | 'succeeded' | 'failed' | 'expired' | 'refunded'>;

export interface ProviderCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export interface CreatePaymentInput {
  reference: string;
  amountPaise: number;
  currency: 'INR';
  description: string;
  customer: { name?: string | null; email?: string | null; phone?: string | null };
  /** Where the provider sends the payer after checkout (our status page). */
  returnUrl: string;
  cancelUrl: string;
  expiresAt: Date;
  metadata: Record<string, string>;
}

export type Checkout =
  | { kind: 'redirect'; url: string }
  /** Razorpay Standard Checkout: our hosted bridge page opens checkout.js with these values. */
  | { kind: 'razorpay'; keyId: string; orderId: string; amountPaise: number; name: string; description: string; prefill: Record<string, string> }
  | { kind: 'mock'; url: string };

export interface CreatePaymentResult {
  providerRef: string;
  status: InternalStatus;
  rawStatus: string;
  checkout: Checkout;
  raw: unknown;
}

export interface ProviderStatus {
  status: InternalStatus;
  rawStatus: string;
  providerPaymentId: string | null;
  method: string | null;
  amountPaise: number | null;
  raw: unknown;
}

export interface RefundResult {
  refundId: string;
  status: 'pending' | 'processed' | 'failed';
  raw: unknown;
}

export interface WebhookEvent {
  eventId: string;
  type: string;
  providerRef: string | null;
  providerPaymentId: string | null;
  status: InternalStatus | null;
  rawStatus: string | null;
  method: string | null;
  amountPaise: number | null;
  raw: unknown;
}

/** Adapter contract (spec §3.7). Core code depends only on this interface. */
export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput, creds: ProviderCredentials): Promise<CreatePaymentResult>;
  getStatus(providerRef: string, creds: ProviderCredentials): Promise<ProviderStatus>;
  refund(providerRef: string, amountPaise: number, creds: ProviderCredentials): Promise<RefundResult>;
  verifyWebhook(headers: Record<string, string>, rawBody: Buffer, creds: ProviderCredentials): WebhookEvent | null;
  /** Optional client-side callback verification (e.g. Razorpay checkout handler signature). */
  verifyCallback?(payload: Record<string, string>, creds: ProviderCredentials): { providerRef: string; providerPaymentId: string } | null;
}

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly retryable: boolean,
    readonly raw?: unknown,
  ) {
    super(`${provider}: ${message}`);
    this.name = 'ProviderError';
  }
}
