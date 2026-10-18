import type { Db } from '@tableos/db';
import type { Env } from '../../config/env';
import { decrypt } from '../../lib/crypto';
import type { ProviderCredentials } from './provider';

export interface RoutedAccount {
  merchantAccountId: string | null;
  provider: string;
  creds: ProviderCredentials;
}

const HEALTH_WINDOW_MS = 60 * 60 * 1000;
const MIN_ATTEMPTS_FOR_HEALTH = 10;
const UNHEALTHY_BELOW = 0.5;

/**
 * Picks merchant accounts for a payment, best first (spec §3.7 Router): by purpose and
 * restaurant, then payment method, priority, and recent provider health. The caller falls
 * back to the next account when creation fails.
 */
export class PaymentRouter {
  constructor(
    private readonly db: Db,
    private readonly env: Env,
  ) {}

  /** Platform account from environment, used when no platform merchant account row exists. */
  private envAccount(): RoutedAccount {
    return {
      merchantAccountId: null,
      provider: this.env.PLATFORM_PG_PROVIDER,
      creds: {
        keyId: this.env.PLATFORM_PG_KEY_ID || 'mock_key',
        keySecret: this.env.PLATFORM_PG_KEY_SECRET || 'mock_secret',
        webhookSecret: this.env.PLATFORM_PG_WEBHOOK_SECRET || 'mock_webhook_secret',
      },
    };
  }

  credsFor(account: { credentialsEncrypted: string }): ProviderCredentials {
    return JSON.parse(decrypt(account.credentialsEncrypted, this.env.CREDENTIALS_ENCRYPTION_KEY)) as ProviderCredentials;
  }

  /** Credentials for webhook verification / status polls of an existing attempt. */
  async credsForAttempt(merchantAccountId: string | null, provider: string): Promise<ProviderCredentials | null> {
    if (!merchantAccountId) return provider === this.env.PLATFORM_PG_PROVIDER ? this.envAccount().creds : null;
    const acc = await this.db.merchantAccount.findUnique({ where: { id: merchantAccountId } });
    return acc ? this.credsFor(acc) : null;
  }

  async candidates(purpose: 'wallet_recharge' | 'flat_plan' | 'diner_bill', restaurantId: string, method?: string): Promise<RoutedAccount[]> {
    const ownerId = purpose === 'diner_bill' ? restaurantId : null;
    const rows = await this.db.merchantAccount.findMany({
      where: { restaurantId: ownerId, status: 'active', ...(method ? { methods: { has: method } } : {}) },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    if (rows.length === 0) return purpose === 'diner_bill' ? [] : [this.envAccount()];

    const since = new Date(Date.now() - HEALTH_WINDOW_MS);
    const stats = await this.db.paymentAttempt.groupBy({
      by: ['merchantAccountId', 'status'],
      where: { merchantAccountId: { in: rows.map((r) => r.id) }, createdAt: { gte: since } },
      _count: { _all: true },
    });
    const health = new Map<string, { ok: number; total: number }>();
    for (const s of stats) {
      if (!s.merchantAccountId) continue;
      const h = health.get(s.merchantAccountId) ?? { ok: 0, total: 0 };
      if (s.status === 'succeeded') h.ok += s._count._all;
      if (s.status === 'succeeded' || s.status === 'failed') h.total += s._count._all;
      health.set(s.merchantAccountId, h);
    }
    const unhealthy = (id: string) => {
      const h = health.get(id);
      return Boolean(h && h.total >= MIN_ATTEMPTS_FOR_HEALTH && h.ok / h.total < UNHEALTHY_BELOW);
    };
    // Healthy accounts first, each group in priority order.
    const ordered = [...rows.filter((r) => !unhealthy(r.id)), ...rows.filter((r) => unhealthy(r.id))];
    return ordered.map((r) => ({ merchantAccountId: r.id, provider: r.provider, creds: this.credsFor(r) }));
  }
}
