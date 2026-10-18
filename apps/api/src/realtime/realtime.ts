import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/postgres-adapter';
import type { Db } from '@tableos/db';
import { type ClientToServerEvents, type ServerToClientEvents, rooms } from '@tableos/schemas';
import type pg from 'pg';
import { Server } from 'socket.io';
import type { Logger } from '../lib/logger';
import { verifySessionToken, type SupabaseVerifier } from '../modules/auth/tokens';

type EventName = keyof ServerToClientEvents;
type Payload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

export interface Realtime {
  emit<E extends EventName>(roomList: string[], event: E, payload: Payload<E>): void;
}

/** Records emits; used in tests and when sockets are disabled. */
export class RecordingRealtime implements Realtime {
  readonly events: Array<{ rooms: string[]; event: EventName; payload: unknown }> = [];
  emit<E extends EventName>(roomList: string[], event: E, payload: Payload<E>): void {
    this.events.push({ rooms: roomList, event, payload });
  }
  clear(): void {
    this.events.length = 0;
  }
}

export class SocketRealtime implements Realtime {
  constructor(private readonly io: Server<ClientToServerEvents, ServerToClientEvents>) {}
  emit<E extends EventName>(roomList: string[], event: E, payload: Payload<E>): void {
    if (roomList.length === 0) return;
    // Socket.IO's typed emit cannot express the generic event union; the signature above keeps callers typed.
    (this.io.to(roomList) as unknown as { emit: (e: string, p: unknown) => void }).emit(event, payload);
  }
}

interface AttachOptions {
  httpServer: HttpServer;
  db: Db;
  pool: pg.Pool;
  verifier: SupabaseVerifier;
  sessionSecret: string;
  corsOrigins: string[];
  log: Logger;
}

const STAFF_ROOMS: Record<string, (rid: string) => string[]> = {
  owner: (rid) => [rooms.kitchen(rid), rooms.floor(rid), rooms.owner(rid)],
  manager: (rid) => [rooms.kitchen(rid), rooms.floor(rid), rooms.owner(rid)],
  waiter: (rid) => [rooms.floor(rid)],
  kitchen: (rid) => [rooms.kitchen(rid)],
};

/**
 * Socket.IO server. The handshake carries either a dashboard JWT (`auth.token`) or a
 * table-session token (`auth.sessionToken`); the server decides which rooms to join.
 * Cross-instance fan-out goes through Postgres (no Redis in the MVP).
 */
export function attachSocketServer(opts: AttachOptions): { io: Server; realtime: SocketRealtime } {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(opts.httpServer, {
    path: '/socket.io',
    cors: { origin: opts.corsOrigins, credentials: true },
    pingInterval: 20_000,
    pingTimeout: 15_000,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000 },
  });
  io.adapter(createAdapter(opts.pool, { tableName: 'pgboss.socket_io_attachments' }));

  io.on('connection', async (socket) => {
    const auth = socket.handshake.auth as { token?: string; sessionToken?: string };
    try {
      if (auth.sessionToken) {
        const c = await verifySessionToken(opts.sessionSecret, auth.sessionToken);
        const session = await opts.db.tableSession.findUnique({ where: { id: c.sid }, select: { status: true, restaurantId: true } });
        if (!session || session.status === 'closed' || session.restaurantId !== c.rid) throw new Error('closed');
        await socket.join([rooms.session(c.sid), rooms.menu(c.rid)]);
      } else if (auth.token) {
        const claims = await opts.verifier.verify(auth.token);
        socket.data.userId = claims.sub;
      } else {
        throw new Error('no credentials');
      }
    } catch {
      socket.disconnect(true);
      return;
    }

    socket.on('join.restaurant', async ({ restaurantId }, ack) => {
      try {
        const userId = socket.data.userId as string | undefined;
        if (!userId) return ack({ ok: false, error: 'unauthorized' });
        const m = await opts.db.membership.findUnique({
          where: { userId_restaurantId: { userId, restaurantId } },
          select: { role: true },
        });
        if (!m) return ack({ ok: false, error: 'forbidden' });
        for (const r of socket.rooms) if (r.startsWith('restaurant:')) await socket.leave(r);
        const list = STAFF_ROOMS[m.role]!(restaurantId);
        await socket.join(list);
        ack({ ok: true, rooms: list });
      } catch (err) {
        opts.log.warn({ err }, 'join.restaurant failed');
        ack({ ok: false, error: 'server_error' });
      }
    });
  });

  return { io, realtime: new SocketRealtime(io) };
}
