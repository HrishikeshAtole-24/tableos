import { z } from 'zod';
import {
  type Diet,
  type OrderStatus,
  type PaidVia,
  type ServiceRequestType,
  type SessionStatus,
  orderStatus,
  paidVia,
  paise,
  serviceRequestType,
  uuid,
} from './common';

// ───── Tables & QR ─────

export const tableInput = z.object({
  label: z.string().trim().min(1).max(20),
  section: z.string().trim().max(30).nullable().default(null),
  active: z.boolean().default(true),
});
export const updateTableInput = tableInput.partial();
export const bulkTablesInput = z.object({
  prefix: z.string().trim().max(10).default('T'),
  from: z.number().int().min(1).max(999),
  to: z.number().int().min(1).max(999),
  section: z.string().trim().max(30).nullable().default(null),
});

export interface TableDto {
  id: string;
  label: string;
  section: string | null;
  qrVersion: number;
  active: boolean;
  qrUrl: string;
  openSession: { id: string; status: SessionStatus; openedAt: string; runningTotalPaise: number } | null;
}

// ───── Diner session ─────

export const createSessionInput = z.object({ qr: z.string().min(10).max(400) });
export interface SessionDto {
  sessionId: string;
  token: string;
  status: SessionStatus;
  table: { id: string; label: string; section: string | null };
  restaurant: { id: string; slug: string; name: string };
  runningTotalPaise: number;
  orders: OrderDto[];
}

// ───── Orders ─────

export const cartLineInput = z.object({
  itemId: uuid,
  variantId: uuid.nullable().default(null),
  addonIds: z.array(uuid).max(30).default([]),
  qty: z.number().int().min(1).max(50),
  note: z.string().trim().max(140).nullable().default(null),
});
export type CartLineInput = z.infer<typeof cartLineInput>;

export const placeOrderInput = z.object({
  lines: z.array(cartLineInput).min(1).max(60),
  note: z.string().trim().max(200).nullable().default(null),
  customerName: z.string().trim().max(60).nullable().default(null),
  customerPhone: z.string().trim().max(16).nullable().default(null),
});
export type PlaceOrderInput = z.infer<typeof placeOrderInput>;

export const staffOrderInput = placeOrderInput.extend({ tableId: uuid });

export const updateOrderStatusInput = z
  .object({
    status: orderStatus.exclude(['placed']),
    reason: z.string().trim().min(3).max(140).optional(),
  })
  .refine((v) => (v.status === 'rejected' || v.status === 'cancelled' ? Boolean(v.reason) : true), {
    message: 'A reason is required',
    path: ['reason'],
  });

export const listOrdersQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',') : undefined))
    .pipe(z.array(orderStatus).optional()),
  sessionId: uuid.optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.string().optional(),
});

export interface OrderItemDto {
  id: string;
  itemId: string;
  name: string;
  variant: { id: string; name: string } | null;
  addons: Array<{ id: string; name: string; pricePaise: number }>;
  unitPricePaise: number;
  qty: number;
  taxRateBp: number;
  note: string | null;
  diet?: Diet;
}

export interface OrderDto {
  id: string;
  number: number;
  sessionId: string;
  table: { id: string; label: string; section: string | null };
  status: OrderStatus;
  placedBy: 'diner' | 'staff';
  customerName: string | null;
  note: string | null;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  rejectReason: string | null;
  items: OrderItemDto[];
  createdAt: string;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
}

export interface UnavailableItemsDetails {
  unavailable: Array<{ itemId: string; name: string }>;
}

// ───── Service requests ─────

export const createServiceRequestInput = z.object({ type: serviceRequestType });
export interface ServiceRequestDto {
  id: string;
  sessionId: string;
  table: { id: string; label: string };
  type: ServiceRequestType;
  status: 'open' | 'acknowledged' | 'resolved';
  createdAt: string;
  acknowledgedAt: string | null;
}

// ───── Billing ─────

export const discountInput = z.object({
  discountPaise: paise,
  reason: z.string().trim().max(120).nullable().default(null),
});
export const closeSessionInput = z.object({ paidVia: paidVia.optional() });
export const markPaidInput = z.object({ paidVia });

export interface BillLineDto {
  name: string;
  variant: string | null;
  addons: string[];
  qty: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  taxRateBp: number;
}

export interface BillDto {
  id: string | null;
  sessionId: string;
  table: { id: string; label: string };
  restaurant: { name: string; address: string | null; gstin: string | null; fssaiNo: string | null };
  lines: BillLineDto[];
  subtotalPaise: number;
  taxPaise: number;
  serviceChargeBp: number;
  serviceChargePaise: number;
  discountPaise: number;
  discountReason: string | null;
  roundOffPaise: number;
  totalPaise: number;
  status: 'open' | 'paid' | 'void';
  paidVia: PaidVia | null;
  paidAt: string | null;
  orderCount: number;
  openedAt: string;
}



export { ORDER_STEPS } from './constants';
