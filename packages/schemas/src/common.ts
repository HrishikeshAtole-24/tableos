import { z } from 'zod';

export const uuid = z.uuid();
export const paise = z.number().int().min(0).max(100_000_000);
export const signedPaise = z.number().int().min(-100_000_000).max(100_000_000);
export const basisPoints = z.number().int().min(0).max(10_000);

export const LOCALES = ['en', 'hi', 'mr'] as const;
export const locale = z.enum(LOCALES);
export type Locale = z.infer<typeof locale>;

export const ROLES = ['owner', 'manager', 'waiter', 'kitchen'] as const;
export const role = z.enum(ROLES);
export type Role = z.infer<typeof role>;

export const DIETS = ['veg', 'nonveg', 'egg'] as const;
export const diet = z.enum(DIETS);
export type Diet = z.infer<typeof diet>;

export const ORDER_STATUSES = [
  'placed',
  'accepted',
  'preparing',
  'ready',
  'served',
  'rejected',
  'cancelled',
] as const;
export const orderStatus = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatus>;

export const SESSION_STATUSES = ['open', 'bill_requested', 'closed'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SERVICE_REQUEST_TYPES = ['waiter', 'water', 'bill'] as const;
export const serviceRequestType = z.enum(SERVICE_REQUEST_TYPES);
export type ServiceRequestType = z.infer<typeof serviceRequestType>;

export const PAID_VIA = ['cash', 'upi', 'card', 'online'] as const;
export const paidVia = z.enum(PAID_VIA);
export type PaidVia = z.infer<typeof paidVia>;

export const PAYMENT_STATUSES = [
  'created',
  'pending',
  'succeeded',
  'failed',
  'expired',
  'cancelled',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const phone = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{9,14}$/, 'Enter a valid phone number with country code');
export const email = z.email().trim().toLowerCase();

/** Indian phone numbers may be typed without +91; normalise to E.164. */
export function normalisePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return `+${digits}`;
}

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export const idParam = z.object({ id: uuid });
