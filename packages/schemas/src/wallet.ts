import { z } from 'zod';
import { type PaymentStatus, paise, signedPaise, uuid } from './common.js';

export const rechargeInput = z.object({
  amountPaise: paise.min(100).max(10_000_000),
  purpose: z.enum(['wallet_recharge', 'flat_plan']).default('wallet_recharge'),
});
export type RechargeInput = z.infer<typeof rechargeInput>;

export interface WalletDto {
  balancePaise: number;
  orderingPaused: boolean;
  zeroReachedAt: string | null;
  graceEndsAt: string | null;
  plan: 'payg' | 'flat';
  flatPlanUntil: string | null;
  month: {
    key: string;
    acceptedOrders: number;
    feesChargedPaise: number;
    capPaise: number;
    capReached: boolean;
  };
  pricing: {
    feePerOrderPaise: number;
    monthlyCapPaise: number;
    flatPlanPaise: number;
    minRechargePaise: number;
    alertLevelsPaise: number[];
    graceFloorPaise: number;
    graceHours: number;
    gstRateBp: number;
  };
  lowBalance: boolean;
}

export interface LedgerEntryDto {
  id: string;
  type: 'recharge' | 'order_fee' | 'adjustment' | 'refund' | 'flat_plan';
  amountPaise: number;
  balanceAfterPaise: number;
  orderId: string | null;
  orderNumber: number | null;
  paymentId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface InvoiceDto {
  id: string;
  number: string;
  amountPaise: number;
  gstPaise: number;
  totalPaise: number;
  description: string;
  issuedAt: string;
}

export interface CheckoutDto {
  paymentId: string;
  reference: string;
  provider: string;
  amountPaise: number;
  creditPaise: number;
  gstPaise: number;
  status: PaymentStatus;
  /** Provider-hosted page or our own hosted bridge page that opens the provider checkout. */
  checkoutUrl: string;
  expiresAt: string;
}

export interface PaymentDto {
  id: string;
  reference: string;
  purpose: 'wallet_recharge' | 'flat_plan' | 'diner_bill';
  amountPaise: number;
  creditPaise: number;
  status: PaymentStatus;
  method: string | null;
  provider: string | null;
  createdAt: string;
  succeededAt: string | null;
}

// ───── Platform admin ─────

export const walletAdjustmentInput = z.object({
  restaurantId: uuid,
  amountPaise: signedPaise.refine((v) => v !== 0, 'Amount cannot be zero'),
  reason: z.string().trim().min(5).max(200),
});

export const pricingConfigInput = z
  .object({
    restaurantId: uuid.nullable().default(null),
    feePerOrderPaise: paise.max(10_000),
    monthlyCapPaise: paise.max(10_000_000),
    flatPlanPaise: paise.max(10_000_000),
    minRechargePaise: paise.max(10_000_000),
    alertLevelsPaise: z.array(paise).max(5),
    graceFloorPaise: signedPaise.max(0),
    graceHours: z.number().int().min(0).max(24 * 14),
    gstRateBp: z.number().int().min(0).max(5_000),
  })
  .partial()
  .required({ restaurantId: true });
export type PricingConfigInput = z.infer<typeof pricingConfigInput>;

export const restaurantStatusInput = z.object({
  status: z.enum(['active', 'suspended', 'closed']),
  reason: z.string().trim().min(3).max(200),
});

export const merchantAccountInput = z.object({
  restaurantId: uuid.nullable().default(null),
  provider: z.enum(['razorpay', 'stripe', 'mock']),
  label: z.string().trim().max(60).optional(),
  priority: z.number().int().min(1).max(1000).default(100),
  methods: z.array(z.enum(['upi', 'card', 'netbanking', 'wallet'])).min(1).default(['upi', 'card']),
  credentials: z.object({
    keyId: z.string().trim().min(3).max(200),
    keySecret: z.string().trim().min(3).max(400),
    webhookSecret: z.string().trim().min(3).max(400),
  }),
});
