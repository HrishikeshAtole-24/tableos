import type { Payment, PaymentAttempt, Tx } from '@tableos/db';
import { type CheckoutDto, type PaymentDto, type RechargeInput, formatPaise } from '@tableos/schemas';
import type { Deps } from '../../context';
import { randomCode } from '../../lib/crypto';
import { AppError, badRequest, notFound, unprocessable } from '../../lib/errors';
import { iso } from '../../lib/http';
import { businessDate, financialYear, startOfNextMonthIST } from '../../lib/time';
import { withTx, type AfterCommit } from '../../lib/tx';
import { JOBS } from '../../jobs/queue';
import { gstOn } from '../wallet/fees';
import { getPricing } from '../wallet/wallet.repository';
import type { WalletService } from '../wallet/wallet.service';
import { type Checkout, type InternalStatus, ProviderError, type WebhookEvent } from './provider';
import type { PaymentRouter } from './router';
import { FINAL_STATUSES } from './status-map';

const PAYMENT_TTL_MS = 30 * 60 * 1000;
const RECONCILE_AFTER_MS = 5 * 60 * 1000;

export function paymentReference(now: Date): string {
  return `PAY-${businessDate(now).replace(/-/g, '')}-${randomCode(6)}`;
}

export class PaymentService {
  constructor(
    private readonly deps: Deps,
    private readonly router: PaymentRouter,
    private readonly wallet: WalletService,
  ) {}

  // ───── Create ─────

  async createRecharge(restaurantId: string, userId: string, input: RechargeInput): Promise<CheckoutDto> {
    const now = this.deps.clock();
    const cfg = await getPricing(this.deps.db, restaurantId);
    const restaurant = await this.deps.db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true } });
    const user = await this.deps.db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, phone: true } });

    let creditPaise: number;
    let base: number;
    let description: string;
    if (input.purpose === 'flat_plan') {
      creditPaise = 0;
      base = cfg.flatPlanPaise;
      description = `TableOS flat plan for ${restaurant.name}`;
    } else {
      if (input.amountPaise < cfg.minRechargePaise) {
        throw unprocessable('recharge_too_small', `Minimum recharge is ${formatPaise(cfg.minRechargePaise)}`);
      }
      creditPaise = input.amountPaise;
      base = input.amountPaise;
      description = `TableOS wallet recharge for ${restaurant.name}`;
    }
    const gst = gstOn(base, cfg.gstRateBp);
    const amountPaise = base + gst;

    const payment = await this.deps.db.payment.create({
      data: {
        restaurantId,
        reference: paymentReference(now),
        purpose: input.purpose,
        amountPaise,
        creditPaise,
        initiatedBy: userId,
        expiresAt: new Date(now.getTime() + PAYMENT_TTL_MS),
      },
    });

    const { attempt, checkout } = await this.startAttempt(payment, {
      description,
      customer: { name: user.name, email: user.email, phone: user.phone },
      metadata: { purpose: input.purpose, restaurant_id: restaurantId },
    });

    return {
      paymentId: payment.id,
      reference: payment.reference,
      provider: attempt.provider,
      amountPaise,
      creditPaise,
      gstPaise: gst,
      status: 'pending',
      checkoutUrl: checkout.kind === 'redirect' ? checkout.url : `${this.deps.env.API_PUBLIC_URL}/v1/pay/${payment.reference}`,
      expiresAt: payment.expiresAt.toISOString(),
    };
  }

  /**
   * Try merchant accounts in router order until one creates the payment. Older pending
   * attempts of the same payment are cancelled so only one checkout can succeed.
   */
  private async startAttempt(
    payment: Payment,
    info: { description: string; customer: { name: string | null; email: string | null; phone: string | null }; metadata: Record<string, string> },
  ): Promise<{ attempt: PaymentAttempt; checkout: Checkout }> {
    const accounts = await this.router.candidates(payment.purpose, payment.restaurantId);
    if (accounts.length === 0) throw unprocessable('no_payment_account', 'Online payments are not set up');

    await this.deps.db.paymentAttempt.updateMany({
      where: { paymentId: payment.id, status: { in: ['created', 'pending'] } },
      data: { status: 'cancelled' },
    });

    const errors: string[] = [];
    for (const acc of accounts) {
      const provider = this.deps.providers.get(acc.provider);
      try {
        const result = await provider.createPayment(
          {
            reference: payment.reference,
            amountPaise: payment.amountPaise,
            currency: 'INR',
            description: info.description,
            customer: info.customer,
            returnUrl: `${this.deps.env.CONSOLE_URL}/wallet?payment=${payment.reference}`,
            cancelUrl: `${this.deps.env.CONSOLE_URL}/wallet?payment=${payment.reference}&cancelled=1`,
            expiresAt: payment.expiresAt,
            metadata: info.metadata,
          },
          acc.creds,
        );
        const attempt = await this.deps.db.paymentAttempt.create({
          data: {
            paymentId: payment.id,
            merchantAccountId: acc.merchantAccountId,
            provider: acc.provider,
            providerRef: result.providerRef,
            status: result.status,
            rawStatus: result.rawStatus,
            checkout: result.checkout as object,
            rawResponse: result.raw as object,
          },
        });
        await this.deps.db.payment.update({ where: { id: payment.id }, data: { status: 'pending' } });
        return { attempt, checkout: result.checkout };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(message);
        this.deps.log.warn({ err, provider: acc.provider, reference: payment.reference }, 'payment create failed; trying next account');
        await this.deps.db.paymentAttempt.create({
          data: { paymentId: payment.id, merchantAccountId: acc.merchantAccountId, provider: acc.provider, status: 'failed', error: message.slice(0, 500) },
        });
        if (err instanceof ProviderError && !err.retryable) break;
      }
    }
    await this.deps.db.payment.update({ where: { id: payment.id }, data: { status: 'failed' } });
    this.deps.log.error({ reference: payment.reference, errors }, 'all payment providers failed');
    throw new AppError(502, 'payment_provider_unavailable', 'Payments are temporarily unavailable. Please try again in a few minutes.');
  }

  // ───── Read ─────

  async getForRestaurant(restaurantId: string, reference: string): Promise<PaymentDto> {
    const p = await this.deps.db.payment.findFirst({
      where: { reference, restaurantId },
      include: { attempts: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!p) throw notFound('Payment');
    // Pending for a while: poll the provider now rather than waiting for the reconcile job.
    if (p.status === 'pending' && p.attempts[0]?.providerRef) await this.reconcileOne(p.id).catch(() => undefined);
    const fresh = await this.deps.db.payment.findUniqueOrThrow({ where: { id: p.id }, include: { attempts: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    return toDto(fresh);
  }

  async listForRestaurant(restaurantId: string): Promise<PaymentDto[]> {
    const rows = await this.deps.db.payment.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { attempts: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return rows.map(toDto);
  }

  /** Data for the hosted checkout bridge page. */
  async checkoutPage(reference: string): Promise<{ payment: Payment; attempt: PaymentAttempt } | null> {
    const payment = await this.deps.db.payment.findUnique({ where: { reference } });
    if (!payment) return null;
    const attempt = await this.deps.db.paymentAttempt.findFirst({
      where: { paymentId: payment.id, status: { in: ['created', 'pending', 'succeeded'] } },
      orderBy: { createdAt: 'desc' },
    });
    return attempt ? { payment, attempt } : null;
  }

  // ───── Verify (browser callback → server-side status poll) ─────

  /**
   * The browser redirect is never trusted for credit (spec §3.7): we verify the provider's
   * callback signature, then poll the provider and apply whatever status it reports.
   */
  async verifyCallback(reference: string, payload: Record<string, string>): Promise<PaymentDto> {
    const found = await this.checkoutPage(reference);
    if (!found) throw notFound('Payment');
    const provider = this.deps.providers.get(found.attempt.provider);
    const creds = await this.router.credsForAttempt(found.attempt.merchantAccountId, found.attempt.provider);
    if (!creds) throw badRequest('Payment account missing');
    if (provider.verifyCallback) {
      const ok = provider.verifyCallback(payload, creds);
      if (!ok || ok.providerRef !== found.attempt.providerRef) throw badRequest('Payment signature mismatch');
    }
    await this.reconcileOne(found.payment.id);
    const fresh = await this.deps.db.payment.findUniqueOrThrow({ where: { id: found.payment.id }, include: { attempts: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    return toDto(fresh);
  }

  // ───── Webhooks ─────

  /**
   * POST /v1/webhooks/:provider/:merchantAccountId — verify the signature on the raw body,
   * store the event, skip an event_id already seen, then apply.
   */
  async handleWebhook(providerName: string, merchantAccountId: string, headers: Record<string, string>, rawBody: Buffer): Promise<'ok' | 'duplicate' | 'ignored'> {
    if (!this.deps.providers.has(providerName)) throw notFound('Provider');
    const accountId = merchantAccountId === 'platform' ? null : merchantAccountId;
    const creds = await this.router.credsForAttempt(accountId, providerName);
    if (!creds) throw notFound('Merchant account');
    const event = this.deps.providers.get(providerName).verifyWebhook(headers, rawBody, creds);
    if (!event) throw badRequest('Invalid webhook signature');

    const stored = await this.deps.db.webhookEvent.createMany({
      data: [{ provider: providerName, eventId: event.eventId, eventType: event.type, payload: event.raw as object }],
      skipDuplicates: true,
    });
    if (stored.count === 0) {
      const prior = await this.deps.db.webhookEvent.findUnique({ where: { provider_eventId: { provider: providerName, eventId: event.eventId } } });
      if (prior?.processedAt) return 'duplicate';
    }
    try {
      const result = await this.applyWebhook(providerName, event);
      await this.deps.db.webhookEvent.update({
        where: { provider_eventId: { provider: providerName, eventId: event.eventId } },
        data: { processedAt: this.deps.clock(), error: null },
      });
      return result;
    } catch (err) {
      await this.deps.db.webhookEvent.update({
        where: { provider_eventId: { provider: providerName, eventId: event.eventId } },
        data: { error: (err as Error).message.slice(0, 500) },
      });
      throw err;
    }
  }

  private async applyWebhook(providerName: string, event: WebhookEvent): Promise<'ok' | 'ignored'> {
    if (!event.providerRef || !event.status) return 'ignored';
    const attempt = await this.deps.db.paymentAttempt.findUnique({
      where: { provider_providerRef: { provider: providerName, providerRef: event.providerRef } },
    });
    if (!attempt) return 'ignored';
    await this.applyOutcome(attempt.paymentId, attempt.id, event.status, {
      rawStatus: event.rawStatus,
      providerPaymentId: event.providerPaymentId,
      method: event.method,
      amountPaise: event.amountPaise,
    });
    return 'ok';
  }

  // ───── Reconciliation ─────

  async reconcileOne(paymentId: string): Promise<InternalStatus | null> {
    const payment = await this.deps.db.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return null;
    const attempt = await this.deps.db.paymentAttempt.findFirst({
      where: { paymentId, providerRef: { not: null }, status: { in: ['created', 'pending', 'succeeded'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!attempt?.providerRef) return null;
    const creds = await this.router.credsForAttempt(attempt.merchantAccountId, attempt.provider);
    if (!creds) return null;
    const status = await this.deps.providers.get(attempt.provider).getStatus(attempt.providerRef, creds);
    let next = status.status;
    if (next === 'pending' && this.deps.clock() > payment.expiresAt) next = 'expired';
    await this.applyOutcome(paymentId, attempt.id, next, status);
    return next;
  }

  /** Job: poll providers for payments pending longer than 5 minutes. */
  async reconcilePending(): Promise<number> {
    const cutoff = new Date(this.deps.clock().getTime() - RECONCILE_AFTER_MS);
    const stuck = await this.deps.db.payment.findMany({
      where: { status: { in: ['created', 'pending'] }, createdAt: { lt: cutoff } },
      select: { id: true },
      take: 200,
    });
    for (const p of stuck) {
      try {
        await this.reconcileOne(p.id);
      } catch (err) {
        this.deps.log.warn({ err, paymentId: p.id }, 'reconcile failed');
      }
    }
    return stuck.length;
  }

  // ───── Apply outcome (single place money moves) ─────

  async applyOutcome(
    paymentId: string,
    attemptId: string,
    status: InternalStatus,
    details: { rawStatus: string | null; providerPaymentId: string | null; method: string | null; amountPaise: number | null },
  ): Promise<void> {
    await withTx(this.deps.db, async (tx, afterCommit) => {
      // Lock the payment row so concurrent webhook + poll apply exactly once.
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });

      await tx.paymentAttempt.update({
        where: { id: attemptId },
        data: {
          status,
          rawStatus: details.rawStatus,
          ...(details.providerPaymentId ? { providerPaymentId: details.providerPaymentId } : {}),
        },
      });

      if (payment.status === status || (FINAL_STATUSES.includes(payment.status as InternalStatus) && status !== 'refunded')) return;

      if (status === 'succeeded') {
        if (details.amountPaise !== null && details.amountPaise !== payment.amountPaise) {
          this.deps.log.error({ paymentId, expected: payment.amountPaise, got: details.amountPaise }, 'amount mismatch; not crediting');
          await tx.payment.update({ where: { id: paymentId }, data: { status: 'failed' } });
          return;
        }
        await tx.payment.update({
          where: { id: paymentId },
          data: { status: 'succeeded', succeededAt: this.deps.clock(), method: details.method },
        });
        await this.fulfil(tx, payment, afterCommit);
        return;
      }
      await tx.payment.update({ where: { id: paymentId }, data: { status } });
    });
  }

  private async fulfil(tx: Tx, payment: Payment, afterCommit: AfterCommit): Promise<void> {
    const now = this.deps.clock();
    const cfg = await getPricing(tx, payment.restaurantId);
    const base = payment.purpose === 'flat_plan' ? cfg.flatPlanPaise : payment.creditPaise;
    const gst = payment.amountPaise - base;

    if (payment.purpose === 'wallet_recharge') {
      await this.wallet.applyBalanceChange(tx, { restaurantId: payment.restaurantId, amountPaise: payment.creditPaise, type: 'recharge', paymentId: payment.id }, afterCommit);
    } else if (payment.purpose === 'flat_plan') {
      const r = await tx.restaurant.findUniqueOrThrow({ where: { id: payment.restaurantId }, select: { flatPlanUntil: true } });
      const from = r.flatPlanUntil && r.flatPlanUntil > now ? r.flatPlanUntil : now;
      // Paid in advance for a calendar month: active until the next month boundary after `from`.
      const until = startOfNextMonthIST(from);
      await tx.restaurant.update({ where: { id: payment.restaurantId }, data: { plan: 'flat', flatPlanUntil: until } });
      // Flat plan also lifts any wallet pause caused by an unpaid balance.
      await tx.wallet.updateMany({ where: { restaurantId: payment.restaurantId }, data: { orderingPaused: false } });
    }

    const fy = financialYear(now);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'invoice:' + fy}))`;
    const count = await tx.invoice.count({ where: { number: { startsWith: `TOS/${fy}/` } } });
    const invoice = await tx.invoice.create({
      data: {
        restaurantId: payment.restaurantId,
        paymentId: payment.id,
        number: `TOS/${fy}/${String(count + 1).padStart(6, '0')}`,
        amountPaise: base,
        gstPaise: gst,
        totalPaise: payment.amountPaise,
        description: payment.purpose === 'flat_plan' ? 'Flat plan (unlimited orders for the month)' : 'Wallet recharge (prepaid platform fees)',
      },
    });
    afterCommit(() =>
      this.deps.jobs.send(JOBS.email, {
        restaurantId: payment.restaurantId,
        template: 'recharge_receipt',
        vars: { amount: formatPaise(payment.amountPaise), invoice: invoice.number, reference: payment.reference },
      }),
    );
  }
}

function toDto(p: Payment & { attempts: PaymentAttempt[] }): PaymentDto {
  return {
    id: p.id,
    reference: p.reference,
    purpose: p.purpose,
    amountPaise: p.amountPaise,
    creditPaise: p.creditPaise,
    status: p.status,
    method: p.method,
    provider: p.attempts[0]?.provider ?? null,
    createdAt: p.createdAt.toISOString(),
    succeededAt: iso(p.succeededAt),
  };
}
