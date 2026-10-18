import type { OrderDto, ServiceRequestDto } from './ordering.js';

export const SOCKET_EVENTS = {
  orderCreated: 'order.created',
  orderUpdated: 'order.updated',
  requestCreated: 'request.created',
  requestUpdated: 'request.updated',
  menuAvailability: 'menu.availability',
  sessionUpdated: 'session.updated',
  walletUpdated: 'wallet.updated',
} as const;

export interface ServerToClientEvents {
  'order.created': (order: OrderDto) => void;
  'order.updated': (order: OrderDto) => void;
  'request.created': (req: ServiceRequestDto) => void;
  'request.updated': (req: ServiceRequestDto) => void;
  'menu.availability': (p: { itemId: string; available: boolean; kind: 'item' | 'addon' }) => void;
  'session.updated': (p: { sessionId: string; status: 'open' | 'bill_requested' | 'closed'; runningTotalPaise: number }) => void;
  'wallet.updated': (p: { balancePaise: number; orderingPaused: boolean }) => void;
}

export interface ClientToServerEvents {
  'join.restaurant': (p: { restaurantId: string }, ack: (r: { ok: boolean; rooms?: string[]; error?: string }) => void) => void;
}

export const rooms = {
  kitchen: (restaurantId: string) => `restaurant:${restaurantId}:kitchen`,
  floor: (restaurantId: string) => `restaurant:${restaurantId}:floor`,
  owner: (restaurantId: string) => `restaurant:${restaurantId}:owner`,
  menu: (restaurantId: string) => `restaurant:${restaurantId}:menu`,
  session: (sessionId: string) => `session:${sessionId}`,
};
