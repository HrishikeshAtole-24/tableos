import type { Prisma } from '@tableos/db';
import { type ServiceRequestDto, type ServiceRequestType, rooms } from '@tableos/schemas';
import type { Deps } from '../../context';
import { notFound, tooMany } from '../../lib/errors';
import { iso } from '../../lib/http';
import { withTx } from '../../lib/tx';

export const SERVICE_COOLDOWN_MS = 60_000;

const include = { session: { select: { table: { select: { id: true, label: true } } } } } satisfies Prisma.ServiceRequestInclude;
type Row = Prisma.ServiceRequestGetPayload<{ include: typeof include }>;

function toDto(r: Row): ServiceRequestDto {
  return {
    id: r.id,
    sessionId: r.sessionId,
    table: r.session.table,
    type: r.type,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    acknowledgedAt: iso(r.acknowledgedAt),
  };
}

export class ServiceRequestsService {
  constructor(private readonly deps: Deps) {}

  /** 60-second cooldown per request type per session, enforced on the server. */
  async create(diner: { sessionId: string; restaurantId: string }, type: ServiceRequestType): Promise<ServiceRequestDto> {
    return withTx(this.deps.db, async (tx, afterCommit) => {
      await tx.$queryRaw`SELECT id FROM table_sessions WHERE id = ${diner.sessionId}::uuid FOR UPDATE`;
      const now = this.deps.clock();
      const last = await tx.serviceRequest.findFirst({ where: { sessionId: diner.sessionId, type }, orderBy: { createdAt: 'desc' } });
      if (last) {
        const wait = SERVICE_COOLDOWN_MS - (now.getTime() - last.createdAt.getTime());
        if (wait > 0) throw tooMany('Staff have been notified. Please wait a moment.', Math.ceil(wait / 1000));
      }
      const created = await tx.serviceRequest.create({ data: { restaurantId: diner.restaurantId, sessionId: diner.sessionId, type, createdAt: now }, include });
      await tx.tableSession.update({
        where: { id: diner.sessionId },
        data: { lastActivityAt: now, ...(type === 'bill' ? { status: 'bill_requested' } : {}) },
      });
      const dto = toDto(created);
      afterCommit(() => {
        this.deps.realtime.emit([rooms.floor(diner.restaurantId), rooms.owner(diner.restaurantId)], 'request.created', dto);
        this.deps.realtime.emit([rooms.session(diner.sessionId)], 'request.updated', dto);
      });
      return dto;
    });
  }

  async listOpen(restaurantId: string): Promise<ServiceRequestDto[]> {
    const rows = await this.deps.db.serviceRequest.findMany({
      where: { restaurantId, status: 'open', session: { status: { not: 'closed' } } },
      include,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDto);
  }

  async listForSession(sessionId: string): Promise<ServiceRequestDto[]> {
    const rows = await this.deps.db.serviceRequest.findMany({ where: { sessionId }, include, orderBy: { createdAt: 'desc' }, take: 20 });
    return rows.map(toDto);
  }

  async acknowledge(restaurantId: string, id: string, userId: string): Promise<ServiceRequestDto> {
    const r = await this.deps.db.serviceRequest.findFirst({ where: { id, restaurantId } });
    if (!r) throw notFound('Request');
    const updated = await this.deps.db.serviceRequest.update({
      where: { id },
      data: { status: 'acknowledged', acknowledgedBy: userId, acknowledgedAt: this.deps.clock() },
      include,
    });
    const dto = toDto(updated);
    this.deps.realtime.emit([rooms.floor(restaurantId), rooms.owner(restaurantId), rooms.session(r.sessionId)], 'request.updated', dto);
    return dto;
  }
}
