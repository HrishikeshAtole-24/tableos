import { createServer } from 'node:http';
import * as Sentry from '@sentry/node';
import { createPrismaClient } from '@tableos/db';
import pg from 'pg';
import { createApp, allowedOrigins } from './app';
import { loadEnv } from './config/env';
import type { Deps } from './context';
import { jobDefinitions } from './jobs/definitions';
import { PgBossQueue } from './jobs/queue';
import { createLogger } from './lib/logger';
import { createSupabaseVerifier } from './modules/auth/tokens';
import { HttpAiClient } from './modules/imports/ai-client';
import { LogMailer, ResendMailer } from './modules/notifications/mailer';
import { MockProvider } from './modules/payments/providers/mock';
import { RazorpayProvider } from './modules/payments/providers/razorpay';
import { StripeProvider } from './modules/payments/providers/stripe';
import { ProviderRegistry } from './modules/payments/registry';
import { SupabaseStorage } from './modules/storage/storage';
import { attachSocketServer, RecordingRealtime, type Realtime } from './realtime/realtime';
import { createServices } from './services';

async function main() {
  const env = loadEnv();
  const log = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
  if (env.SENTRY_DSN) Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0.1 });

  const db = createPrismaClient(env.DATABASE_URL);
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 4 });
  await pool.query(`CREATE SCHEMA IF NOT EXISTS pgboss; CREATE TABLE IF NOT EXISTS pgboss.socket_io_attachments (id bigserial UNIQUE, created_at timestamptz DEFAULT NOW(), payload bytea)`);

  const providers = new ProviderRegistry().register(new RazorpayProvider()).register(new StripeProvider());
  if (env.NODE_ENV !== 'production') providers.register(new MockProvider(env.API_PUBLIC_URL));

  const storage = new SupabaseStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.STORAGE_BUCKET);
  await storage.ensureBucket().catch((err) => log.warn({ err }, 'could not ensure storage bucket'));

  const jobs = new PgBossQueue(env.DATABASE_URL, log);
  const verifier = createSupabaseVerifier(env.SUPABASE_URL, env.SUPABASE_JWT_SECRET);
  const httpServer = createServer();

  // Realtime is wired after the HTTP server exists; services read it through this holder.
  const realtimeHolder: { current: Realtime } = { current: new RecordingRealtime() };
  const deps: Deps = {
    env,
    db,
    log,
    realtime: { emit: (rooms, event, payload) => realtimeHolder.current.emit(rooms, event, payload) },
    jobs,
    providers,
    storage,
    mailer: env.EMAIL_API_KEY ? new ResendMailer(env.EMAIL_API_KEY, env.EMAIL_FROM) : new LogMailer(log),
    ai: new HttpAiClient(env.AI_SERVICE_URL, env.AI_SERVICE_TOKEN),
    clock: () => new Date(),
  };

  const services = createServices(deps);
  const app = createApp(deps, services, verifier);
  httpServer.on('request', app);
  const { io, realtime } = attachSocketServer({ httpServer, db, pool, verifier, sessionSecret: env.SESSION_JWT_SECRET, corsOrigins: allowedOrigins(deps), log });
  realtimeHolder.current = realtime;

  await jobs.start(jobDefinitions(deps, services), env.JOBS_ENABLED);

  httpServer.listen(env.API_PORT, () => log.info({ port: env.API_PORT }, 'api listening'));

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'shutting down');
    httpServer.close();
    io.close();
    await jobs.stop().catch(() => undefined);
    await db.$disconnect();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
