import type { Prisma, Tx } from '@tableos/db';
import { type Diet, type OrderDto, type OrderStatus, type PlaceOrderInput, type Role, normalisePhone, rooms, totalOrder } from '@tableos/schemas';
import type { z } from 'zod';
import type { listOrdersQuery } from '@tableos/schemas';
import type { Deps } from '../../context';
import { forbidden, notFound, tooMany, unprocessable } from '../../lib/errors';
import { iso } from '../../lib/http';
import { businessDate } from '../../lib/time';
import { withTx, type AfterCommit } from '../../lib/tx';
import { canOrder, type WalletService } from '../wallet/wallet.service';
import { BILLABLE_STATUSES, canEditItems, canTransition, roleCanMove } from './order-state';
import { priceCart } from './pricing';

export const orderInclude = {
  items: { orderBy: { createdAt: 'asc' }, include: { item: { select: { diet: true } } } },
  session: { select: { id: true, table: { select: { id: true, label: true, section: true } } } },
} satisfies Prisma.OrderInclude;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function toOrderDto(o: OrderRow): OrderDto {
  return {
    id: o.id,
    number: o.number,
    sessionId: o.sessionId,
    table: o.session.table,
    status: o.status,
    placedBy: o.placedBy,
    customerName: o.customerName,
    note: o.note,
    subtotalPaise: o.subtotalPaise,
    taxPaise: o.taxPaise,
    totalPaise: o.totalPaise,
    rejectReason: o.rejectReason,
    items: o.items.map((i) => ({
      id: i.id,
      itemId: i.itemId,
      name: i.nameSnapshot,
      variant: i.variantSnapshot as { id: string; name: string } | null,
      addons: i.addonsSnapshot as Array<{ id: string; name: string; pricePaise: number }>,
      unitPricePaise: i.unitPricePaise,
      qty: i.qty,
      taxRateBp: i.taxRateBp,
      note: i.note,
      diet: i.item.diet as Diet,
    })),
    createdAt: o.createdAt.toISOString(),
    acceptedAt: iso(o.acceptedAt),
    preparingAt: iso(o.preparingAt),
    readyAt: iso(o.readyAt),
    servedAt: iso(o.servedAt),
  };
}

const ORDER_WINDOW_MS = 10 * 60 * 1000;
const ORDERS_PER_WINDOW = 10;

export class OrdersService {
  constructor(
    private readonly deps: Deps,
    private readonly wallet: WalletService,
  ) {}

  private emitOrder(afterCommit: AfterCommit, event: 'order.created' | 'order.updated', order: OrderDto, restaurantId: string) {
    afterCommit(() => {
      this.deps.realtime.emit([rooms.kitchen(restaurantId), rooms.floor(restaurantId), rooms.owner(restaurantId)], event, order);
      this.deps.realtime.emit([rooms.session(order.sessionId)], 'order.updated', order);
    });
  }

  private async emitSessionTotal(tx: Tx, afterCommit: AfterCommit, sessionId: string) {
    const s = await tx.tableSession.findUniqueOrThrow({ where: { id: sessionId }, select: { status: true } });
    const agg = await tx.order.aggregate({ where: { sessionId, status: { in: [...BILLABLE_STATUSES, 'placed'] } }, _sum: { totalPaise: true } });
    const total = agg._sum.totalPaise ?? 0;
    afterCommit(() => this.deps.realtime.emit([rooms.session(sessionId)], 'session.updated', { sessionId, status: s.status, runningTotalPaise: total }));
  }

  /** Daily order numbers per restaurant, allocated under an advisory lock. */
  private async nextNumber(tx: Tx, restaurantId: string, date: string): Promise<number> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order-number:${restaurantId}:${date}`}))`;
    const max = await tx.order.aggregate({ where: { restaurantId, businessDate: date }, _max: { number: true } });
    return (max._max.number ?? 0) + 1;
  }

  /** Accept inside the current transaction: status, timestamps, and the order fee (same transaction, spec §3.1 step 5). */
  private async acceptInTx(tx: Tx, restaurantId: string, orderId: string, afterCommit: AfterCommit) {
    const fee = await this.wallet.chargeAcceptedOrder(tx, restaurantId, orderId, afterCommit);
    await tx.order.update({ where: { id: orderId }, data: { status: 'accepted', acceptedAt: this.deps.clock(), feeChargedPaise: fee } });
  }

  private async assertCanOrder(tx: Tx, restaurantId: string) {
    const r = await tx.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { status: true, orderingEnabled: true, wallet: { select: { orderingPaused: true } } },
    });
    const check = canOrder(r, r.wallet);
    if (!check.canOrder) {
      throw unprocessable('ordering_unavailable', 'Ordering is paused right now. Please order with staff.', { reason: check.reason });
    }
  }

  private async create(
    tx: Tx,
    afterCommit: AfterCommit,
    args: { restaurantId: string; sessionId: string; input: PlaceOrderInput; placedBy: 'diner' | 'staff'; userId?: string },
  ): Promise<OrderDto> {
    const { restaurantId, sessionId, input } = args;
    await this.assertCanOrder(tx, restaurantId);
    const cart = await priceCart(tx, restaurantId, input.lines);
    const now = this.deps.clock();
    const settings = await tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { timezone: true, requireFirstOrderAcceptance: true } });
    const date = businessDate(now, settings.timezone);
    const number = await this.nextNumber(tx, restaurantId, date);

    const order = await tx.order.create({
      data: {
        restaurantId,
        sessionId,
        number,
        businessDate: date,
        placedBy: args.placedBy,
        createdAt: now,
        placedByUserId: args.userId ?? null,
        customerName: input.customerName,
        customerPhone: input.customerPhone ? normalisePhone(input.customerPhone) : null,
        note: input.note,
        subtotalPaise: cart.subtotalPaise,
        taxPaise: cart.taxPaise,
        totalPaise: cart.totalPaise,
        items: {
          create: cart.lines.map((l) => ({
            restaurantId,
            itemId: l.itemId,
            nameSnapshot: l.nameSnapshot,
            variantSnapshot: l.variantSnapshot ?? undefined,
            addonsSnapshot: l.addonsSnapshot,
            unitPricePaise: l.unitPricePaise,
            qty: l.qty,
            taxRateBp: l.taxRateBp,
            note: l.note,
          })),
        },
      },
    });

    // Staff orders are accepted at creation. Diner orders wait only while the session has no accepted order.
    let autoAccept = args.placedBy === 'staff' || !settings.requireFirstOrderAcceptance;
    if (!autoAccept) {
      const accepted = await tx.order.count({ where: { sessionId, status: { in: [...BILLABLE_STATUSES] } } });
      autoAccept = accepted > 0;
    }
    if (autoAccept) await this.acceptInTx(tx, restaurantId, order.id, afterCommit);

    await tx.tableSession.update({ where: { id: sessionId }, data: { lastActivityAt: now } });
    const dto = toOrderDto(await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude }));
    this.emitOrder(afterCommit, 'order.created', dto, restaurantId);
    await this.emitSessionTotal(tx, afterCommit, sessionId);
    return dto;
  }

  async placeDinerOrder(diner: { sessionId: string; restaurantId: string }, input: PlaceOrderInput): Promise<OrderDto> {
    return withTx(this.deps.db, async (tx, afterCommit) => {
      await tx.$queryRaw`SELECT id FROM table_sessions WHERE id = ${diner.sessionId}::uuid FOR UPDATE`;
      const since = new Date(this.deps.clock().getTime() - ORDER_WINDOW_MS);
      const recent = await tx.order.count({ where: { sessionId: diner.sessionId, createdAt: { gte: since } } });
      if (recent >= ORDERS_PER_WINDOW) throw tooMany('Too many orders from this table. Please ask staff for help.', 600);
      const session = await tx.tableSession.findUniqueOrThrow({ where: { id: diner.sessionId }, select: { status: true } });
      if (session.status === 'closed') throw unprocessable('session_closed', 'This table session has ended');
      return this.create(tx, afterCommit, { restaurantId: diner.restaurantId, sessionId: diner.sessionId, input, placedBy: 'diner' });
    });
  }

  /** Waiter places an order on behalf of a table; opens a session if none is open. */
  async placeStaffOrder(restaurantId: string, userId: string, tableId: string, input: PlaceOrderInput): Promise<OrderDto> {
    return withTx(this.deps.db, async (tx, afterCommit) => {
      const table = await tx.restaurantTable.findFirst({ where: { id: tableId, restaurantId, active: true } });
      if (!table) throw notFound('Table');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`table-session:${tableId}`}))`;
      let session = await tx.tableSession.findFirst({ where: { tableId, status: { not: 'closed' } } });
      session ??= await tx.tableSession.create({ data: { restaurantId, tableId } });
      return this.create(tx, afterCommit, { restaurantId, sessionId: session.id, input, placedBy: 'staff', userId });
    });
  }

  async list(restaurantId: string, q: z.infer<typeof listOrdersQuery>): Promise<{ items: OrderDto[]; nextCursor: string | null }> {
    const where: Prisma.OrderWhereInput = {
      restaurantId,
      ...(q.status ? { status: { in: q.status } } : {}),
      ...(q.sessionId ? { sessionId: q.sessionId } : {}),
      ...(q.date ? { businessDate: q.date } : {}),
    };
    const rows = await this.deps.db.order.findMany({
      where,
      include: orderInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    return { items: page.map(toOrderDto), nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null };
  }

  /** Board view: everything still in flight plus today's finished orders. */
  async live(restaurantId: string): Promise<OrderDto[]> {
    const r = await this.deps.db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { timezone: true } });
    const today = businessDate(this.deps.clock(), r.timezone);
    const rows = await this.deps.db.order.findMany({
      where: { restaurantId, OR: [{ status: { in: ['placed', 'accepted', 'preparing', 'ready'] } }, { businessDate: today }] },
      include: orderInclude,
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return rows.map(toOrderDto);
  }

  async updateStatus(restaurantId: string, role: Role, orderId: string, to: Exclude<OrderStatus, 'placed'>, reason?: string): Promise<OrderDto> {
    return withTx(this.deps.db, async (tx, afterCommit) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      const order = await tx.order.findFirst({ where: { id: orderId, restaurantId } });
      if (!order) throw notFound('Order');
      if (order.status === to) return toOrderDto(await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude }));
      if (!canTransition(order.status, to)) {
        throw unprocessable('invalid_transition', `An order that is ${order.status} cannot become ${to}`);
      }
      if (!roleCanMove(role, order.status, to)) throw forbidden('Your role cannot make this change');

      const now = this.deps.clock();
      if (to === 'accepted') {
        await this.acceptInTx(tx, restaurantId, orderId, afterCommit);
      } else {
        const stamp: Record<string, Date> = {};
        if (to === 'preparing') stamp.preparingAt = now;
        if (to === 'ready') stamp.readyAt = now;
        if (to === 'served') stamp.servedAt = now;
        await tx.order.update({
          where: { id: orderId },
          data: { status: to, ...stamp, ...(to === 'rejected' || to === 'cancelled' ? { rejectReason: reason ?? null } : {}) },
        });
      }
      const dto = toOrderDto(await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude }));
      this.emitOrder(afterCommit, 'order.updated', dto, restaurantId);
      await this.emitSessionTotal(tx, afterCommit, order.sessionId);
      return dto;
    });
  }

  /** Remove a line before Preparing; totals are recalculated. Removing the last line rejects the order. */
  async removeItem(restaurantId: string, orderId: string, orderItemId: string): Promise<OrderDto> {
    return withTx(this.deps.db, async (tx, afterCommit) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      const order = await tx.order.findFirst({ where: { id: orderId, restaurantId }, include: { items: true } });
      if (!order) throw notFound('Order');
      if (!canEditItems(order.status)) throw unprocessable('order_locked', 'The kitchen has started this order');
      const line = order.items.find((i) => i.id === orderItemId);
      if (!line) throw notFound('Order item');
      await tx.orderItem.delete({ where: { id: line.id } });
      const remaining = order.items.filter((i) => i.id !== line.id);
      if (remaining.length === 0) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: order.status === 'placed' ? 'rejected' : 'cancelled', rejectReason: 'All items removed', subtotalPaise: 0, taxPaise: 0, totalPaise: 0 },
        });
      } else {
        const t = totalOrder(remaining);
        await tx.order.update({ where: { id: orderId }, data: t });
      }
      const dto = toOrderDto(await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude }));
      this.emitOrder(afterCommit, 'order.updated', dto, restaurantId);
      await this.emitSessionTotal(tx, afterCommit, order.sessionId);
      return dto;
    });
  }
}
