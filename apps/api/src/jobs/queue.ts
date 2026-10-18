import { PgBoss } from 'pg-boss';
import type { Logger } from '../lib/logger';

export const JOBS = {
  menuImport: 'menu.import',
  menuTranslate: 'menu.translate',
  imageResize: 'image.resize',
  walletAlerts: 'wallet.alerts',
  walletGraceCheck: 'wallet.grace-check',
  paymentsReconcile: 'payments.reconcile',
  sessionsAutoclose: 'sessions.autoclose',
  analyticsAggregate: 'analytics.aggregate',
  idempotencyCleanup: 'idempotency.cleanup',
  email: 'notify.email',
} as const;
export type JobName = (typeof JOBS)[keyof typeof JOBS];

export interface SendOpts {
  /** Deduplicate: only one queued job per key. */
  singletonKey?: string;
  startAfterSeconds?: number;
}

export interface JobQueue {
  send(name: JobName, data: Record<string, unknown>, opts?: SendOpts): Promise<void>;
}

/** Collects jobs; tests drain it by calling handlers directly. */
export class MemoryQueue implements JobQueue {
  readonly sent: Array<{ name: JobName; data: Record<string, unknown> }> = [];
  async send(name: JobName, data: Record<string, unknown>): Promise<void> {
    this.sent.push({ name, data });
  }
  take(name: JobName): Array<Record<string, unknown>> {
    const out = this.sent.filter((j) => j.name === name).map((j) => j.data);
    for (let i = this.sent.length - 1; i >= 0; i--) if (this.sent[i]!.name === name) this.sent.splice(i, 1);
    return out;
  }
}

export type JobHandler = (data: Record<string, unknown>) => Promise<void>;

export interface JobDefinition {
  name: JobName;
  handler: JobHandler;
  /** Cron in Asia/Kolkata for scheduled jobs. */
  cron?: string;
  retryLimit?: number;
  concurrency?: number;
}

/**
 * pg-boss backed queue (jobs stored in PostgreSQL, no Redis). Every job retries with
 * exponential backoff and logs its outcome; handlers are written to be idempotent.
 */
export class PgBossQueue implements JobQueue {
  private readonly boss: PgBoss;
  private started = false;

  constructor(
    connectionString: string,
    private readonly log: Logger,
  ) {
    this.boss = new PgBoss({ connectionString, schema: 'pgboss', application_name: 'tableos-jobs' });
    this.boss.on('error', (err) => this.log.error({ err }, 'pg-boss error'));
  }

  async start(definitions: JobDefinition[], runWorkers: boolean): Promise<void> {
    await this.boss.start();
    this.started = true;
    for (const def of definitions) {
      await this.boss.createQueue(def.name, {
        retryLimit: def.retryLimit ?? 5,
        retryDelay: 15,
        retryBackoff: true,
        expireInSeconds: 15 * 60,
      });
      if (!runWorkers) continue;
      await this.boss.work<Record<string, unknown>>(def.name, { batchSize: 1, localConcurrency: def.concurrency ?? 2 }, async (jobs) => {
        for (const job of jobs) {
          const started = Date.now();
          try {
            await def.handler(job.data ?? {});
            this.log.info({ job: def.name, id: job.id, ms: Date.now() - started }, 'job done');
          } catch (err) {
            this.log.error({ err, job: def.name, id: job.id }, 'job failed');
            throw err;
          }
        }
      });
      if (def.cron) await this.boss.schedule(def.name, def.cron, {}, { tz: 'Asia/Kolkata' });
    }
  }

  async send(name: JobName, data: Record<string, unknown>, opts: SendOpts = {}): Promise<void> {
    if (!this.started) throw new Error('Job queue not started');
    await this.boss.send(name, data, {
      ...(opts.singletonKey ? { singletonKey: opts.singletonKey } : {}),
      ...(opts.startAfterSeconds ? { startAfter: opts.startAfterSeconds } : {}),
    });
  }

  async stop(): Promise<void> {
    if (this.started) await this.boss.stop({ graceful: true, timeout: 10_000 });
  }
}
