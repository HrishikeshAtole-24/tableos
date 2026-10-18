import type { OrderStatus, Role } from '@tableos/schemas';

/** placed → accepted → preparing → ready → served; placed → rejected; accepted|preparing → cancelled. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  placed: ['accepted', 'rejected'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['served'],
  served: [],
  rejected: [],
  cancelled: [],
};

/** Which role may perform which move. Owner and manager may do everything. */
const ROLE_MOVES: Record<Role, ReadonlyArray<`${OrderStatus}>${OrderStatus}`>> = {
  owner: ['placed>accepted', 'placed>rejected', 'accepted>preparing', 'preparing>ready', 'ready>served', 'accepted>cancelled', 'preparing>cancelled'],
  manager: ['placed>accepted', 'placed>rejected', 'accepted>preparing', 'preparing>ready', 'ready>served', 'accepted>cancelled', 'preparing>cancelled'],
  waiter: ['placed>accepted', 'placed>rejected', 'ready>served', 'accepted>cancelled'],
  kitchen: ['accepted>preparing', 'preparing>ready'],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function roleCanMove(role: Role, from: OrderStatus, to: OrderStatus): boolean {
  return ROLE_MOVES[role].includes(`${from}>${to}`);
}

/** Items can be removed only before the kitchen starts. */
export function canEditItems(status: OrderStatus): boolean {
  return status === 'placed' || status === 'accepted';
}

/** Orders that count towards the bill: accepted and not cancelled or rejected (spec §3.7 Billing). */
export const BILLABLE_STATUSES: readonly OrderStatus[] = ['accepted', 'preparing', 'ready', 'served'];
