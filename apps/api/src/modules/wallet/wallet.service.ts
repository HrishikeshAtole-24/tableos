import type { Tx, LedgerType } from '@tableos/db';
import { type InvoiceDto, type LedgerEntryDto, type WalletDto, formatPaise, rooms } from '@tableos/schemas';
import type { Deps } from '../../context';
import { badRequest } from '../../lib/errors';
import { iso } from '../../lib/http';
import { isOpenAt, monthKey } from '../../lib/time';
import { withTx, type AfterCommit } from '../../lib/tx';
import { JOBS } from '../../jobs/queue';
import { crossedAlertLevel, graceEnded, graceEndsAt, orderFee } from './fees';
import { getPricing, insertLedger, lockUsageMonth, lockWallet } from './wallet.repository';

export function flatPlanActive(r: { plan: string; flatPlanUntil: Date | null }, now: Date): boolean {
  return r.plan === 'flat' && r.flatPlanUntil !== null && r.flatPlanUntil.getTime() > now.getTime();
}

export interface Orderability {
  canOrder: boolean;
  reason: 'ok' | 'restaurant_inactive' | 'ordering_disabled' | 'wallet_paused';
}

/** canOrder = restaurant active && ordering enabled && wallet not paused (spec §3.7). */
export function canOrder(
  r: { status: string; orderingEnabled: boolean },
  wallet: { orderingPaused: boolean } | null,
): Orderability {
  if (r.status !== 'active') return { canOrder: false, reason: 'restaurant_inactive' };
  if (!r.orderingEnabled) return { canOrder: false, reason: 'ordering_disabled' };
  if (wallet?.orderingPaused) return { canOrder: false, reason: 'wallet_paused' };
  return { canOrder: true, reason: 'ok' };
}

export class WalletService {
  constructor(private readonly deps: Deps) {}

  /**
   * Meter one accepted order. MUST run inside the transaction that sets the order to
   * Accepted; locks usage_months then wallets (always in that order to avoid deadlocks).
   */
  async chargeAcceptedOrder(tx: Tx, restaurantId: string, orderId: string, afterCommit: AfterCommit): Promise<number> {
    const now = this.deps.clock();
    const key = monthKey(now);
    const restaurant = await tx.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { plan: true, flatPlanUntil: true },
    });
    const cfg = await getPricing(tx, restaurantId);
    const usage = await lockUsageMonth(tx, restaurantId, key);
    const wallet = await lockWallet(tx, restaurantId);

    const fee = orderFee(cfg, usage.fees_charged_paise, flatPlanActive(restaurant, now));
    const balance = wallet.balance_paise - fee;

    await tx.usageMonth.update({
      where: { id: usage.id },
      data: { acceptedOrders: { increment: 1 }, feesChargedPaise: { increment: fee } },
    });

    if (fee > 0) {
      await insertLedger(tx, {
        restaurantId,
        type: 'order_fee',
        amountPaise: -fee,
        balanceAfterPaise: balance,
        monthKey: key,
        orderId,
      });
      const alertLevel = crossedAlertLevel(cfg.alertLevelsPaise, balance, wallet.last_alert_level_paise);
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balancePaise: balance,
          ...(balance <= 0 && !wallet.zero_reached_at ? { zeroReachedAt: now } : {}),
          ...(alertLevel !== null ? { lastAlertLevelPaise: alertLevel } : {}),
        },
      });
      afterCommit(() => this.deps.realtime.emit([rooms.owner(restaurantId)], 'wallet.updated', { balancePaise: balance, orderingPaused: wallet.ordering_paused }));
      if (alertLevel !== null) {
        afterCommit(() => this.deps.jobs.send(JOBS.walletAlerts, { restaurantId, level: alertLevel, balancePaise: balance }));
      }
    }
    return fee;
  }

  /**
   * Credit the wallet (recharge, refund, positive adjustment) or debit it (negative
   * adjustment). Clears grace and pause once the balance is zero or above (spec §2.3 Recovery).
   */
  async applyBalanceChange(
    tx: Tx,
    args: {
      restaurantId: string;
      amountPaise: number;
      type: LedgerType;
      paymentId?: string | null;
      reason?: string | null;
      actorUserId?: string | null;
    },
    afterCommit: AfterCommit,
  ): Promise<number> {
    const now = this.deps.clock();
    const wallet = await lockWallet(tx, args.restaurantId);
    const balance = wallet.balance_paise + args.amountPaise;
    await insertLedger(tx, {
      restaurantId: args.restaurantId,
      type: args.type,
      amountPaise: args.amountPaise,
      balanceAfterPaise: balance,
      monthKey: monthKey(now),
      paymentId: args.paymentId ?? null,
      reason: args.reason ?? null,
      actorUserId: args.actorUserId ?? null,
    });
    // Spec §3.7 "After recharge": at zero or above, clear zero_reached_at and ordering_paused.
    const recovered = balance >= 0;
    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balancePaise: balance,
        zeroReachedAt: recovered ? null : (wallet.zero_reached_at ?? now),
        ...(recovered ? { orderingPaused: false } : {}),
        ...(args.amountPaise > 0 ? { lastAlertLevelPaise: null } : {}),
      },
    });
    const paused = recovered ? false : wallet.ordering_paused;
    afterCommit(() => this.deps.realtime.emit([rooms.owner(args.restaurantId)], 'wallet.updated', { balancePaise: balance, orderingPaused: paused }));
    return balance;
  }

  async adjust(restaurantId: string, amountPaise: number, reason: string, actorUserId: string): Promise<number> {
    return withTx(this.deps.db, async (tx, afterCommit) => {
      const exists = await tx.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
      if (!exists) throw badRequest('Restaurant not found');
      const balance = await this.applyBalanceChange(tx, { restaurantId, amountPaise, type: 'adjustment', reason, actorUserId }, afterCommit);
      await tx.auditLog.create({
        data: {
          actorUserId,
          restaurantId,
          action: 'wallet.adjust',
          entityType: 'wallet',
          entityId: restaurantId,
          after: { amountPaise, reason, balancePaise: balance },
        },
      });
      return balance;
    });
  }

  async getWallet(restaurantId: string): Promise<WalletDto> {
    const now = this.deps.clock();
    const key = monthKey(now);
    const [restaurant, wallet, usage, cfg] = await Promise.all([
      this.deps.db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { plan: true, flatPlanUntil: true } }),
      this.deps.db.wallet.findUnique({ where: { restaurantId } }),
      this.deps.db.usageMonth.findUnique({ where: { restaurantId_monthKey: { restaurantId, monthKey: key } } }),
      getPricing(this.deps.db, restaurantId),
    ]);
    const balance = wallet?.balancePaise ?? 0;
    const fees = usage?.feesChargedPaise ?? 0;
    const lowest = Math.max(...cfg.alertLevelsPaise, 0);
    return {
      balancePaise: balance,
      orderingPaused: wallet?.orderingPaused ?? false,
      zeroReachedAt: iso(wallet?.zeroReachedAt),
      graceEndsAt: iso(graceEndsAt(cfg, wallet?.zeroReachedAt ?? null)),
      plan: flatPlanActive(restaurant, now) ? 'flat' : 'payg',
      flatPlanUntil: iso(restaurant.flatPlanUntil),
      month: {
        key,
        acceptedOrders: usage?.acceptedOrders ?? 0,
        feesChargedPaise: fees,
        capPaise: cfg.monthlyCapPaise,
        capReached: fees >= cfg.monthlyCapPaise,
      },
      pricing: {
        feePerOrderPaise: cfg.feePerOrderPaise,
        monthlyCapPaise: cfg.monthlyCapPaise,
        flatPlanPaise: cfg.flatPlanPaise,
        minRechargePaise: cfg.minRechargePaise,
        alertLevelsPaise: cfg.alertLevelsPaise,
        graceFloorPaise: cfg.graceFloorPaise,
        graceHours: cfg.graceHours,
        gstRateBp: cfg.gstRateBp,
      },
      lowBalance: balance <= lowest,
    };
  }

  async listLedger(restaurantId: string, limit: number, cursor?: string): Promise<{ items: LedgerEntryDto[]; nextCursor: string | null }> {
    const rows = await this.deps.db.walletLedger.findMany({
      where: { restaurantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const orderIds = page.map((r) => r.orderId).filter((x): x is string => Boolean(x));
    const orders = orderIds.length
      ? await this.deps.db.order.findMany({ where: { id: { in: orderIds }, restaurantId }, select: { id: true, number: true } })
      : [];
    const numberById = new Map(orders.map((o) => [o.id, o.number]));
    return {
      items: page.map((r) => ({
        id: r.id,
        type: r.type,
        amountPaise: r.amountPaise,
        balanceAfterPaise: r.balanceAfterPaise,
        orderId: r.orderId,
        orderNumber: r.orderId ? (numberById.get(r.orderId) ?? null) : null,
        paymentId: r.paymentId,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    };
  }

  async listInvoices(restaurantId: string): Promise<InvoiceDto[]> {
    const rows = await this.deps.db.invoice.findMany({ where: { restaurantId }, orderBy: { issuedAt: 'desc' }, take: 100 });
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      amountPaise: r.amountPaise,
      gstPaise: r.gstPaise,
      totalPaise: r.totalPaise,
      description: r.description,
      issuedAt: r.issuedAt.toISOString(),
    }));
  }

  /**
   * Grace job (every 15 min): pause ordering only outside opening hours, never during
   * service (spec §2.3 "When grace ends").
   */
  async runGraceCheck(): Promise<{ paused: string[] }> {
    const now = this.deps.clock();
    const candidates = await this.deps.db.wallet.findMany({
      where: { orderingPaused: false, OR: [{ balancePaise: { lt: 0 } }, { zeroReachedAt: { not: null } }] },
      select: { restaurantId: true },
    });
    const paused: string[] = [];
    for (const { restaurantId } of candidates) {
      const did = await withTx(this.deps.db, async (tx, afterCommit) => {
        const cfg = await getPricing(tx, restaurantId);
        const r = await tx.restaurant.findUniqueOrThrow({
          where: { id: restaurantId },
          select: { openingHours: true, timezone: true, plan: true, flatPlanUntil: true, name: true },
        });
        if (flatPlanActive(r, now)) return false;
        const w = await lockWallet(tx, restaurantId);
        if (w.ordering_paused || !graceEnded(cfg, w.balance_paise, w.zero_reached_at, now)) return false;
        if (isOpenAt(r.openingHours as never, now, r.timezone)) return false;
        await tx.wallet.update({ where: { id: w.id }, data: { orderingPaused: true } });
        afterCommit(() => this.deps.realtime.emit([rooms.owner(restaurantId)], 'wallet.updated', { balancePaise: w.balance_paise, orderingPaused: true }));
        afterCommit(() =>
          this.deps.jobs.send(JOBS.email, {
            restaurantId,
            template: 'ordering_paused',
            vars: { balance: formatPaise(w.balance_paise) },
          }),
        );
        return true;
      });
      if (did) paused.push(restaurantId);
    }
    return { paused };
  }
}
