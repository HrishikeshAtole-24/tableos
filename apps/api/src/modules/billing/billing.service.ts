import type { Tx } from '@tableos/db';
import { type BillDto, type PaidVia, computeBill, rooms } from '@tableos/schemas';
import type { Deps } from '../../context';
import { notFound, unprocessable } from '../../lib/errors';
import { iso } from '../../lib/http';
import { withTx } from '../../lib/tx';
import { BILLABLE_STATUSES } from '../orders/order-state';

export class BillingService {
  constructor(private readonly deps: Deps) {}

  /**
   * One bill per table session. It sums accepted orders that are not cancelled, with tax
   * per item, optional service charge, discount, and a round-off line (spec §3.7 Billing).
   */
  private async compute(tx: Tx | Deps['db'], restaurantId: string, sessionId: string): Promise<BillDto> {
    const session = await tx.tableSession.findFirst({
      where: { id: sessionId, restaurantId },
      include: {
        table: { select: { id: true, label: true } },
        restaurant: { select: { name: true, address: true, gstin: true, fssaiNo: true, serviceChargeBp: true } },
        bill: true,
        orders: { where: { status: { in: [...BILLABLE_STATUSES] } }, include: { items: true } },
      },
    });
    if (!session) throw notFound('Session');
    const items = session.orders.flatMap((o) => o.items);
    const bill = session.bill;
    const serviceChargeBp = session.restaurant.serviceChargeBp;
    const totals = computeBill({
      lines: items.map((i) => ({ unitPricePaise: i.unitPricePaise, qty: i.qty, taxRateBp: i.taxRateBp })),
      serviceChargeBp,
      discountPaise: bill?.discountPaise ?? 0,
    });
    // Paid bills are frozen at the amounts stored when they were settled.
    const frozen = bill?.status === 'paid';
    return {
      id: bill?.id ?? null,
      sessionId: session.id,
      table: session.table,
      restaurant: { name: session.restaurant.name, address: session.restaurant.address, gstin: session.restaurant.gstin, fssaiNo: session.restaurant.fssaiNo },
      lines: items.map((i) => ({
        name: i.nameSnapshot,
        variant: (i.variantSnapshot as { name: string } | null)?.name ?? null,
        addons: (i.addonsSnapshot as Array<{ name: string }>).map((a) => a.name),
        qty: i.qty,
        unitPricePaise: i.unitPricePaise,
        lineTotalPaise: i.unitPricePaise * i.qty,
        taxRateBp: i.taxRateBp,
      })),
      subtotalPaise: frozen ? bill.subtotalPaise : totals.subtotalPaise,
      taxPaise: frozen ? bill.taxPaise : totals.taxPaise,
      serviceChargeBp,
      serviceChargePaise: frozen ? bill.serviceChargePaise : totals.serviceChargePaise,
      discountPaise: frozen ? bill.discountPaise : totals.discountPaise,
      discountReason: bill?.discountReason ?? null,
      roundOffPaise: frozen ? bill.roundOffPaise : totals.roundOffPaise,
      totalPaise: frozen ? bill.totalPaise : totals.totalPaise,
      status: bill?.status ?? 'open',
      paidVia: bill?.paidVia ?? null,
      paidAt: iso(bill?.paidAt),
      orderCount: session.orders.length,
      openedAt: session.openedAt.toISOString(),
    };
  }

  get(restaurantId: string, sessionId: string): Promise<BillDto> {
    return this.compute(this.deps.db, restaurantId, sessionId);
  }

  async setDiscount(restaurantId: string, sessionId: string, discountPaise: number, reason: string | null, actorUserId: string): Promise<BillDto> {
    return withTx(this.deps.db, async (tx) => {
      const session = await tx.tableSession.findFirst({ where: { id: sessionId, restaurantId }, include: { bill: true } });
      if (!session) throw notFound('Session');
      if (session.bill?.status === 'paid') throw unprocessable('bill_paid', 'This bill is already paid');
      await tx.bill.upsert({
        where: { sessionId },
        create: { restaurantId, sessionId, discountPaise, discountReason: reason },
        update: { discountPaise, discountReason: reason },
      });
      await tx.auditLog.create({ data: { actorUserId, restaurantId, action: 'bill.discount', entityType: 'session', entityId: sessionId, after: { discountPaise, reason } } });
      return this.compute(tx, restaurantId, sessionId);
    });
  }

  /** Mark paid (cash, UPI, card, online), freeze the amounts, and close the session. */
  async markPaid(restaurantId: string, sessionId: string, paidVia: PaidVia): Promise<BillDto> {
    return withTx(this.deps.db, async (tx, afterCommit) => {
      await tx.$queryRaw`SELECT id FROM table_sessions WHERE id = ${sessionId}::uuid AND restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
      const pending = await tx.order.count({ where: { sessionId, restaurantId, status: 'placed' } });
      if (pending > 0) throw unprocessable('orders_pending', 'Accept or reject waiting orders before closing the bill');
      const live = await this.compute(tx, restaurantId, sessionId);
      if (live.status === 'paid') return live;
      const now = this.deps.clock();
      await tx.bill.upsert({
        where: { sessionId },
        create: {
          restaurantId,
          sessionId,
          subtotalPaise: live.subtotalPaise,
          taxPaise: live.taxPaise,
          serviceChargePaise: live.serviceChargePaise,
          discountPaise: live.discountPaise,
          roundOffPaise: live.roundOffPaise,
          totalPaise: live.totalPaise,
          status: 'paid',
          paidVia,
          paidAt: now,
        },
        update: {
          subtotalPaise: live.subtotalPaise,
          taxPaise: live.taxPaise,
          serviceChargePaise: live.serviceChargePaise,
          discountPaise: live.discountPaise,
          roundOffPaise: live.roundOffPaise,
          totalPaise: live.totalPaise,
          status: 'paid',
          paidVia,
          paidAt: now,
        },
      });
      await tx.tableSession.update({ where: { id: sessionId }, data: { status: 'closed', closedAt: now } });
      await tx.serviceRequest.updateMany({ where: { sessionId, status: { not: 'resolved' } }, data: { status: 'resolved' } });
      afterCommit(() => {
        this.deps.realtime.emit([rooms.session(sessionId)], 'session.updated', { sessionId, status: 'closed', runningTotalPaise: live.totalPaise });
        this.deps.realtime.emit([rooms.floor(restaurantId), rooms.owner(restaurantId)], 'session.updated', { sessionId, status: 'closed', runningTotalPaise: live.totalPaise });
      });
      return this.compute(tx, restaurantId, sessionId);
    });
  }

  /** Diner view of their own table's bill (read-only). */
  async forDiner(diner: { sessionId: string; restaurantId: string }): Promise<BillDto> {
    return this.compute(this.deps.db, diner.restaurantId, diner.sessionId);
  }
}
