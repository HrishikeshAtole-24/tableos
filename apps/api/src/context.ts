import type { Db } from '@tableos/db';
import type { Role } from '@tableos/schemas';
import type { Env } from './config/env';
import type { Logger } from './lib/logger';
import type { AiClient } from './modules/imports/ai-client';
import type { JobQueue } from './jobs/queue';
import type { Mailer } from './modules/notifications/mailer';
import type { ProviderRegistry } from './modules/payments/registry';
import type { Realtime } from './realtime/realtime';
import type { Storage } from './modules/storage/storage';

/** Everything a module needs, injected once at startup (and replaced with fakes in tests). */
export interface Deps {
  env: Env;
  db: Db;
  log: Logger;
  realtime: Realtime;
  jobs: JobQueue;
  providers: ProviderRegistry;
  storage: Storage;
  mailer: Mailer;
  ai: AiClient;
  clock: () => Date;
}

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  isPlatformAdmin: boolean;
  /** Authentication assurance level from the Supabase JWT ("aal1" | "aal2"). */
  aal: string;
}

export interface DinerSessionCtx {
  sessionId: string;
  restaurantId: string;
  tableId: string;
}

export interface RequestCtx {
  requestId: string;
  log: Logger;
  user?: AuthUser;
  restaurantId?: string;
  role?: Role;
  diner?: DinerSessionCtx;
  ip: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ctx: RequestCtx;
      rawBody?: Buffer;
    }
  }
}
