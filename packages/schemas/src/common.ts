import { z } from 'zod';
import { DIETS, LOCALES, ORDER_STATUSES, PAID_VIA, PAYMENT_STATUSES, ROLES, SERVICE_REQUEST_TYPES, SESSION_STATUSES } from './constants';

export { DIETS, LOCALES, ORDER_STATUSES, PAID_VIA, PAYMENT_STATUSES, ROLES, SERVICE_REQUEST_TYPES, SESSION_STATUSES, normalisePhone } from './constants';

export const uuid = z.uuid();
export const paise = z.number().int().min(0).max(100_000_000);
export const signedPaise = z.number().int().min(-100_000_000).max(100_000_000);
export const basisPoints = z.number().int().min(0).max(10_000);


export const locale = z.enum(LOCALES);
export type Locale = z.infer<typeof locale>;


export const role = z.enum(ROLES);
export type Role = z.infer<typeof role>;


export const diet = z.enum(DIETS);
export type Diet = z.infer<typeof diet>;


export const orderStatus = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatus>;


export type SessionStatus = (typeof SESSION_STATUSES)[number];


export const serviceRequestType = z.enum(SERVICE_REQUEST_TYPES);
export type ServiceRequestType = z.infer<typeof serviceRequestType>;


export const paidVia = z.enum(PAID_VIA);
export type PaidVia = z.infer<typeof paidVia>;


export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const phone = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{9,14}$/, 'Enter a valid phone number with country code');
export const email = z.email().trim().toLowerCase();



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
