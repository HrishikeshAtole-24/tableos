/** Plain constants and helpers with no Zod dependency (safe for client bundles). */

export const LOCALES = ['en', 'hi', 'mr'] as const;

export const ROLES = ['owner', 'manager', 'waiter', 'kitchen'] as const;

export const DIETS = ['veg', 'nonveg', 'egg'] as const;

export const ORDER_STATUSES = [
  'placed',
  'accepted',
  'preparing',
  'ready',
  'served',
  'rejected',
  'cancelled',
] as const;

export const SESSION_STATUSES = ['open', 'bill_requested', 'closed'] as const;

export const SERVICE_REQUEST_TYPES = ['waiter', 'water', 'bill'] as const;

export const PAID_VIA = ['cash', 'upi', 'card', 'online'] as const;

export const PAYMENT_STATUSES = [
  'created',
  'pending',
  'succeeded',
  'failed',
  'expired',
  'cancelled',
  'refunded',
] as const;

/** Indian phone numbers may be typed without +91; normalise to E.164. */
export function normalisePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return `+${digits}`;
}

export const MENU_TAGS = ['bestseller', 'chef_special', 'new', 'must_try'] as const;

export const IMPORT_LIMITS = {
  maxFiles: 10,
  maxFileBytes: 10 * 1024 * 1024,
  perDay: 5,
  mimeTypes: ['image/jpeg', 'image/png', 'application/pdf'] as const,
  lowConfidence: 0.8,
};


export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export const ANALYTICS_TYPES = ['menu_view', 'item_view', 'add_to_cart', 'order_placed'] as const;

export const ORDER_STEPS: readonly (typeof ORDER_STATUSES)[number][] = ['placed', 'accepted', 'preparing', 'ready', 'served'];
