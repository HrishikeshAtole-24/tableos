import type { Deps } from '../context';
import type { Services } from '../services';
import { resizeImage } from '../modules/storage/images';
import { JOBS, type JobDefinition } from './queue';

/** Every job is idempotent, retries with backoff (queue defaults), and logs its outcome. */
export function jobDefinitions(deps: Deps, s: Services): JobDefinition[] {
  return [
    { name: JOBS.menuImport, handler: async (d) => s.imports.process(String(d.importId)), retryLimit: 2, concurrency: 2 },
    { name: JOBS.menuTranslate, handler: async (d) => void (await s.menu.translateMissing(String(d.restaurantId))), retryLimit: 3 },
    { name: JOBS.imageResize, handler: async (d) => void (await resizeImage(deps.storage, String(d.path))), retryLimit: 3 },
    {
      name: JOBS.walletAlerts,
      handler: async (d) => s.notifications.walletAlert({ restaurantId: String(d.restaurantId), level: Number(d.level), balancePaise: Number(d.balancePaise) }),
    },
    { name: JOBS.walletGraceCheck, cron: '*/15 * * * *', handler: async () => void (await s.wallet.runGraceCheck()) },
    { name: JOBS.paymentsReconcile, cron: '*/5 * * * *', handler: async () => void (await s.payments.reconcilePending()) },
    { name: JOBS.sessionsAutoclose, cron: '0 * * * *', handler: async () => void (await s.sessions.autoclose()) },
    { name: JOBS.analyticsAggregate, cron: '30 2 * * *', handler: async () => void (await s.analytics.aggregate()) },
    {
      name: JOBS.idempotencyCleanup,
      cron: '15 3 * * *',
      handler: async () => void (await deps.db.idempotencyKey.deleteMany({ where: { expiresAt: { lt: deps.clock() } } })),
    },
    {
      name: JOBS.email,
      handler: async (d) =>
        s.notifications.sendEmail({
          restaurantId: String(d.restaurantId),
          template: String(d.template),
          ...(d.to ? { to: String(d.to) } : {}),
          vars: (d.vars as Record<string, string>) ?? {},
        }),
    },
  ];
}
