import { z } from 'zod';
import { basisPoints, locale, role, uuid } from './common.js';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

/** One or more open intervals per weekday. An interval may cross midnight (e.g. 18:00–01:00). */
export const openingHours = z.object({
  mon: z.array(z.object({ open: time, close: time })).max(3).default([]),
  tue: z.array(z.object({ open: time, close: time })).max(3).default([]),
  wed: z.array(z.object({ open: time, close: time })).max(3).default([]),
  thu: z.array(z.object({ open: time, close: time })).max(3).default([]),
  fri: z.array(z.object({ open: time, close: time })).max(3).default([]),
  sat: z.array(z.object({ open: time, close: time })).max(3).default([]),
  sun: z.array(z.object({ open: time, close: time })).max(3).default([]),
});
export type OpeningHours = z.infer<typeof openingHours>;
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const theme = z.object({
  primary: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#FC8019'),
});

const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN');
const fssai = z
  .string()
  .trim()
  .regex(/^\d{14}$/, 'FSSAI licence numbers have 14 digits');

export const createRestaurantInput = z.object({
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().max(240).optional(),
  city: z.string().trim().max(60).optional(),
  cuisine: z.array(z.string().trim().min(2).max(30)).max(6).default([]),
  logoUrl: z.url().optional(),
  openingHours: openingHours.optional(),
  gstin: gstin.optional(),
  fssaiNo: fssai.optional(),
});
export type CreateRestaurantInput = z.infer<typeof createRestaurantInput>;

export const updateRestaurantInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/, 'Use 3–48 lowercase letters, numbers or dashes'),
    address: z.string().trim().max(240).nullable(),
    city: z.string().trim().max(60).nullable(),
    cuisine: z.array(z.string().trim().min(2).max(30)).max(6),
    logoUrl: z.url().nullable(),
    coverUrl: z.url().nullable(),
    gstin: gstin.nullable(),
    fssaiNo: fssai.nullable(),
    openingHours,
    languages: z.array(locale).min(1),
    theme,
    orderingEnabled: z.boolean(),
    requireFirstOrderAcceptance: z.boolean(),
    serviceChargeBp: basisPoints.max(2_000),
    googleReviewUrl: z.url().nullable(),
  })
  .partial();
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantInput>;

export interface RestaurantDto {
  id: string;
  slug: string;
  canChangeSlug: boolean;
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  address: string | null;
  city: string | null;
  cuisine: string[];
  gstin: string | null;
  fssaiNo: string | null;
  timezone: string;
  languages: string[];
  theme: { primary: string };
  openingHours: OpeningHours;
  orderingEnabled: boolean;
  requireFirstOrderAcceptance: boolean;
  serviceChargeBp: number;
  googleReviewUrl: string | null;
  plan: 'payg' | 'flat';
  flatPlanUntil: string | null;
  status: 'pending' | 'active' | 'suspended' | 'closed';
  createdAt: string;
}

export interface ChecklistDto {
  menuPublished: boolean;
  tableCreated: boolean;
  qrDownloaded: boolean;
  testOrderPlaced: boolean;
}

export interface MeDto {
  user: {
    id: string;
    email: string | null;
    emailVerified: boolean;
    phone: string | null;
    phoneVerified: boolean;
    name: string | null;
    isPlatformAdmin: boolean;
  };
  memberships: Array<{ restaurantId: string; restaurantName: string; slug: string; role: z.infer<typeof role> }>;
}

export const updateProfileInput = z.object({ name: z.string().trim().min(1).max(80) });

export const inviteStaffInput = z
  .object({
    email: z.email().trim().toLowerCase().optional(),
    phone: z.string().trim().optional(),
    role: z.enum(['manager', 'waiter', 'kitchen']),
  })
  .refine((v) => Boolean(v.email) !== Boolean(v.phone), {
    message: 'Provide either an email or a phone number',
  });
export type InviteStaffInput = z.infer<typeof inviteStaffInput>;

export const updateMemberInput = z.object({ role: z.enum(['manager', 'waiter', 'kitchen']) });

export interface StaffMemberDto {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: z.infer<typeof role>;
  joinedAt: string;
}

export interface StaffInviteDto {
  id: string;
  email: string | null;
  phone: string | null;
  role: z.infer<typeof role>;
  expiresAt: string;
  createdAt: string;
}

export const restaurantIdHeader = 'x-restaurant-id';
export const restaurantIdParam = z.object({ restaurantId: uuid });
