import type { InternalStatus } from './provider';

/**
 * Provider status → internal status. One table per provider, as in the travel project's
 * acquirer status mapping; unknown statuses map to `pending` so reconciliation re-checks them.
 */
const RAZORPAY: Record<string, InternalStatus> = {
  // orders
  created: 'pending',
  attempted: 'pending',
  paid: 'succeeded',
  // payments
  authorized: 'pending',
  captured: 'succeeded',
  failed: 'failed',
  refunded: 'refunded',
};

const STRIPE: Record<string, InternalStatus> = {
  open: 'pending',
  unpaid: 'pending',
  paid: 'succeeded',
  no_payment_required: 'succeeded',
  complete: 'succeeded',
  expired: 'expired',
  failed: 'failed',
  refunded: 'refunded',
};

const MOCK: Record<string, InternalStatus> = {
  created: 'pending',
  pending: 'pending',
  success: 'succeeded',
  failure: 'failed',
  expired: 'expired',
  refunded: 'refunded',
};

const TABLES: Record<string, Record<string, InternalStatus>> = { razorpay: RAZORPAY, stripe: STRIPE, mock: MOCK };

export function mapStatus(provider: string, raw: string): InternalStatus {
  return TABLES[provider]?.[raw] ?? 'pending';
}

export const FINAL_STATUSES: readonly InternalStatus[] = ['succeeded', 'failed', 'expired', 'refunded'];
