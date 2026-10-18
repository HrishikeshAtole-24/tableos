import { z } from 'zod';
import { uuid } from './common.js';

export const ANALYTICS_TYPES = ['menu_view', 'item_view', 'add_to_cart', 'order_placed'] as const;

export const analyticsBatchInput = z.object({
  restaurantId: uuid,
  sessionId: uuid.nullable().default(null),
  events: z
    .array(
      z.object({
        type: z.enum(ANALYTICS_TYPES),
        itemId: uuid.nullable().default(null),
        at: z.iso.datetime().optional(),
      }),
    )
    .min(1)
    .max(50),
});

export interface InsightsDto {
  range: { from: string; to: string };
  totals: { salesPaise: number; orders: number; avgBillPaise: number; sessions: number; menuViews: number; scanToOrderRate: number };
  byDay: Array<{ date: string; salesPaise: number; orders: number }>;
  byHour: Array<{ hour: number; orders: number }>;
  topDishes: Array<{ itemId: string; name: string; qty: number; salesPaise: number }>;
  viewedNotOrdered: Array<{ itemId: string; name: string; views: number; orders: number }>;
}

export interface PlatformMetricsDto {
  activeRestaurants: number;
  totalRestaurants: number;
  acceptedOrders30d: number;
  rechargeVolume30dPaise: number;
  feeRevenue30dPaise: number;
  importsFailed7d: number;
  providerHealth: Array<{ provider: string; successRate: number; attempts: number; avgWebhookDelayMs: number | null }>;
}
