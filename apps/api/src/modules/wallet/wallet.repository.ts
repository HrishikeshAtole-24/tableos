import type { Tx, Db, LedgerType } from '@tableos/db';

export interface LockedUsage {
  id: string;
  accepted_orders: number;
  fees_charged_paise: number;
}

export interface LockedWallet {
  id: string;
  balance_paise: number;
  zero_reached_at: Date | null;
  ordering_paused: boolean;
  last_alert_level_paise: number | null;
}

type Client = Tx | Db;

/** Upsert then lock the month's usage row (SELECT … FOR UPDATE). */
export async function lockUsageMonth(tx: Tx, restaurantId: string, monthKey: string): Promise<LockedUsage> {
  await tx.$executeRaw`
    INSERT INTO usage_months (id, restaurant_id, month_key, accepted_orders, fees_charged_paise, created_at, updated_at)
    VALUES (gen_random_uuid(), ${restaurantId}::uuid, ${monthKey}, 0, 0, now(), now())
    ON CONFLICT (restaurant_id, month_key) DO NOTHING`;
  const rows = await tx.$queryRaw<LockedUsage[]>`
    SELECT id, accepted_orders, fees_charged_paise FROM usage_months
    WHERE restaurant_id = ${restaurantId}::uuid AND month_key = ${monthKey} FOR UPDATE`;
  return rows[0]!;
}

export async function lockWallet(tx: Tx, restaurantId: string): Promise<LockedWallet> {
  await tx.$executeRaw`
    INSERT INTO wallets (id, restaurant_id, balance_paise, ordering_paused, created_at, updated_at)
    VALUES (gen_random_uuid(), ${restaurantId}::uuid, 0, false, now(), now())
    ON CONFLICT (restaurant_id) DO NOTHING`;
  const rows = await tx.$queryRaw<LockedWallet[]>`
    SELECT id, balance_paise, zero_reached_at, ordering_paused, last_alert_level_paise FROM wallets
    WHERE restaurant_id = ${restaurantId}::uuid FOR UPDATE`;
  return rows[0]!;
}

export async function getPricing(db: Client, restaurantId: string) {
  const own = await db.pricingConfig.findUnique({ where: { restaurantId } });
  if (own) return own;
  const global = await db.pricingConfig.findFirst({ where: { restaurantId: null } });
  if (global) return global;
  return db.pricingConfig.create({ data: { restaurantId: null } });
}

export async function insertLedger(
  tx: Tx,
  entry: {
    restaurantId: string;
    type: LedgerType;
    amountPaise: number;
    balanceAfterPaise: number;
    monthKey: string;
    orderId?: string | null;
    paymentId?: string | null;
    reason?: string | null;
    actorUserId?: string | null;
  },
) {
  return tx.walletLedger.create({ data: entry });
}
