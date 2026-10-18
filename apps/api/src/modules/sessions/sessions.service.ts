import { type SessionDto, rooms } from '@tableos/schemas';
import type { Deps } from '../../context';
import { AppError, notFound } from '../../lib/errors';
import { withTx } from '../../lib/tx';
import { SESSION_IDLE_MS } from '../auth/auth.middleware';
import { signSessionToken, verifyQrToken } from '../auth/tokens';
import { BILLABLE_STATUSES } from '../orders/order-state';
import { orderInclude, toOrderDto } from '../orders/orders.service';

export class SessionsService {
  constructor(private readonly deps: Deps) {}

  /**
   * POST /v1/public/sessions: exchange a valid QR token for a table-session JWT.
   * A table has at most one open session; a new scan joins it (shared table).
   */
  async start(qr: string): Promise<SessionDto> {
    const payload = verifyQrToken(this.deps.env.QR_SIGNING_SECRET, qr);
    const invalid = () => new AppError(404, 'invalid_qr', 'This QR code is no longer valid. Please ask the staff for help.');
    if (!payload) throw invalid();

    const session = await withTx(this.deps.db, async (tx) => {
      const table = await tx.restaurantTable.findFirst({
        where: { id: payload.tableId, restaurantId: payload.restaurantId },
        include: { restaurant: { select: { status: true } } },
      });
      if (!table || !table.active || table.qrVersion !== payload.qrVersion) throw invalid();
      if (table.restaurant.status !== 'active') throw new AppError(404, 'restaurant_unavailable', 'This restaurant is not taking orders here right now');

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`table-session:${table.id}`}))`;
      const now = this.deps.clock();
      const open = await tx.tableSession.findFirst({ where: { tableId: table.id, status: { not: 'closed' } } });
      if (open && now.getTime() - open.lastActivityAt.getTime() <= SESSION_IDLE_MS) {
        return tx.tableSession.update({ where: { id: open.id }, data: { lastActivityAt: now } });
      }
      if (open) await tx.tableSession.update({ where: { id: open.id }, data: { status: 'closed', closedAt: now } });
      return tx.tableSession.create({ data: { restaurantId: table.restaurantId, tableId: table.id, openedAt: now, lastActivityAt: now } });
    });

    const token = await signSessionToken(this.deps.env.SESSION_JWT_SECRET, { sid: session.id, rid: session.restaurantId, tid: session.tableId });
    return { ...(await this.current(session.id)), token };
  }

  async current(sessionId: string): Promise<SessionDto> {
    const s = await this.deps.db.tableSession.findUnique({
      where: { id: sessionId },
      include: {
        table: { select: { id: true, label: true, section: true } },
        restaurant: { select: { id: true, slug: true, name: true } },
        orders: { include: orderInclude, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!s) throw notFound('Session');
    const orders = s.orders.map(toOrderDto);
    const running = orders.filter((o) => (BILLABLE_STATUSES as readonly string[]).includes(o.status) || o.status === 'placed').reduce((a, o) => a + o.totalPaise, 0);
    return {
      sessionId: s.id,
      token: '',
      status: s.status,
      table: s.table,
      restaurant: s.restaurant,
      runningTotalPaise: running,
      orders,
    };
  }

  /** Close a session (bill paid, staff close, or idle). Emits a thank-you to the diners. */
  async close(restaurantId: string, sessionId: string): Promise<void> {
    await withTx(this.deps.db, async (tx, afterCommit) => {
      const s = await tx.tableSession.findFirst({ where: { id: sessionId, restaurantId } });
      if (!s) throw notFound('Session');
      if (s.status === 'closed') return;
      await tx.tableSession.update({ where: { id: s.id }, data: { status: 'closed', closedAt: this.deps.clock() } });
      await tx.serviceRequest.updateMany({ where: { sessionId: s.id, status: { not: 'resolved' } }, data: { status: 'resolved' } });
      afterCommit(() => {
        this.deps.realtime.emit([rooms.session(s.id)], 'session.updated', { sessionId: s.id, status: 'closed', runningTotalPaise: 0 });
        this.deps.realtime.emit([rooms.floor(restaurantId), rooms.owner(restaurantId)], 'session.updated', { sessionId: s.id, status: 'closed', runningTotalPaise: 0 });
      });
    });
  }

  /** Hourly job: close sessions idle for 4 hours. */
  async autoclose(): Promise<number> {
    const cutoff = new Date(this.deps.clock().getTime() - SESSION_IDLE_MS);
    const idle = await this.deps.db.tableSession.findMany({
      where: { status: { not: 'closed' }, lastActivityAt: { lt: cutoff } },
      select: { id: true, restaurantId: true },
      take: 1000,
    });
    for (const s of idle) await this.close(s.restaurantId, s.id);
    return idle.length;
  }
}
