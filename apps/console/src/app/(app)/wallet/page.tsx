'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { type CheckoutDto, type InvoiceDto, type LedgerEntryDto, type PaymentDto, type WalletDto, formatPaise } from '@tableos/schemas/client';
import { Badge, Banner, Button, Chip, EmptyState, Input, Skeleton, Tabs, useToast } from '@tableos/ui';
import { PageHeader } from '@/components/Shell';
import { ApiError, api, openHtml, uid } from '@/lib/api';
import { useQuery, useStaffSocket } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import s from '@/components/console.module.css';

const PRESETS = [20000, 50000, 100000, 200000];
const TYPE_LABEL: Record<LedgerEntryDto['type'], string> = { recharge: 'Recharge', order_fee: 'Order fee', adjustment: 'Adjustment', refund: 'Refund', flat_plan: 'Flat plan' };
const DATE = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

function WalletInner() {
  const toast = useToast();
  const params = useSearchParams();
  const { restaurant } = useSession();
  const wallet = useQuery<WalletDto>('/wallet');
  const ledger = useQuery<{ items: LedgerEntryDto[]; nextCursor: string | null }>('/wallet/ledger?limit=50');
  const invoices = useQuery<InvoiceDto[]>('/wallet/invoices');
  const [tab, setTab] = useState<'ledger' | 'invoices'>('ledger');
  const [amount, setAmount] = useState('500');
  const [busy, setBusy] = useState<'recharge' | 'flat' | null>(null);
  const [returned, setReturned] = useState<PaymentDto | null>(null);

  useStaffSocket(restaurant?.id ?? null, {
    onWallet: () => {
      void wallet.reload();
      void ledger.reload();
      void invoices.reload();
    },
  });

  // Coming back from checkout: the server polls the provider; credit only after verification.
  const ref = params.get('payment');
  useEffect(() => {
    if (!ref) return;
    let tries = 0;
    const tick = async () => {
      const p = await api<PaymentDto>(`/wallet/payments/${ref}`).catch(() => null);
      if (p) setReturned(p);
      if (p && ['succeeded', 'failed', 'expired', 'cancelled'].includes(p.status)) {
        void wallet.reload();
        void ledger.reload();
        void invoices.reload();
        return;
      }
      if (++tries < 20) window.setTimeout(tick, 3000);
    };
    void tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  const pay = async (purpose: 'wallet_recharge' | 'flat_plan') => {
    setBusy(purpose === 'flat_plan' ? 'flat' : 'recharge');
    try {
      const c = await api<CheckoutDto>('/wallet/recharges', { method: 'POST', idempotencyKey: uid(), body: { amountPaise: purpose === 'flat_plan' ? 100 : Math.round(Number(amount) * 100), purpose } });
      window.location.href = c.checkoutUrl;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not start the payment');
      setBusy(null);
    }
  };

  const w = wallet.data;
  const gst = w ? Math.round((Number(amount || 0) * 100 * w.pricing.gstRateBp) / 10000) : 0;
  const capPct = w ? Math.min(100, (w.month.feesChargedPaise / w.month.capPaise) * 100) : 0;

  return (
    <div className={s.page}>
      <PageHeader title="Wallet" subtitle="Prepaid platform fees. ₹2 per accepted order, never more than ₹999 a month." />
      <div className={s.stack}>
        {returned && (
          <Banner tone={returned.status === 'succeeded' ? 'success' : returned.status === 'pending' || returned.status === 'created' ? 'info' : 'danger'} title={returned.status === 'succeeded' ? 'Payment received' : returned.status === 'pending' || returned.status === 'created' ? 'Confirming your payment…' : 'Payment did not go through'}>
            {returned.status === 'succeeded'
              ? `${formatPaise(returned.amountPaise)} paid. ${returned.purpose === 'flat_plan' ? 'Flat plan is active.' : `${formatPaise(returned.creditPaise)} added to your wallet.`}`
              : returned.status === 'pending' || returned.status === 'created'
                ? 'We credit your wallet as soon as the payment gateway confirms. This usually takes a few seconds.'
                : 'No money was taken, or it will be refunded automatically by the gateway. You can try again.'}
          </Banner>
        )}
        {w?.orderingPaused && <Banner tone="danger" title="QR ordering is paused">Recharge to switch ordering back on instantly. Your menu keeps working.</Banner>}

        {!w ? (
          <Skeleton height={220} radius={24} />
        ) : (
          <section className={s.walletHero}>
            <div className={s.stack} style={{ gap: 12 }}>
              <span className={s.walletMuted}>{w.plan === 'flat' ? 'Flat plan active' : 'Wallet balance'}</span>
              <span className={`${s.walletBalance} ${w.balancePaise <= 0 ? s.walletLow : ''}`}>{formatPaise(w.balancePaise)}</span>
              {w.plan === 'flat' && w.flatPlanUntil && <span className={s.walletMuted}>Unlimited orders until {DATE.format(new Date(w.flatPlanUntil))}</span>}
              {w.graceEndsAt && w.balancePaise <= 0 && <span className={s.walletMuted}>Grace ends {DATE.format(new Date(w.graceEndsAt))}. Ordering then pauses at closing time.</span>}
              <div className={s.meterWrap}>
                <div className={s.between}>
                  <span className={s.walletMuted}>This month · {w.month.acceptedOrders} accepted orders</span>
                  <span className={s.walletMuted}>
                    {formatPaise(w.month.feesChargedPaise)} / {formatPaise(w.month.capPaise)}
                  </span>
                </div>
                <div className={s.meter}>
                  <span style={{ width: `${capPct}%` }} />
                </div>
                <span className={s.walletMuted}>{w.month.capReached ? 'Cap reached. Orders are free for the rest of the month.' : `${formatPaise(w.month.capPaise - w.month.feesChargedPaise)} until the cap.`}</span>
              </div>
            </div>
            <div className={s.card} style={{ color: 'var(--color-text)' }}>
              <h2 className={s.cardTitle}>Recharge</h2>
              <div className={s.amountChips} style={{ margin: '12px 0' }}>
                {PRESETS.map((p) => (
                  <Chip key={p} selected={Number(amount) * 100 === p} onClick={() => setAmount(String(p / 100))}>
                    {formatPaise(p)}
                  </Chip>
                ))}
              </div>
              <Input label="Amount" prefix="₹" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} hint={`Minimum ${formatPaise(w.pricing.minRechargePaise)}. + ${formatPaise(gst)} GST (18%).`} />
              <div className={s.stack} style={{ gap: 8, marginTop: 16 }}>
                <Button block loading={busy === 'recharge'} disabled={Number(amount) * 100 < w.pricing.minRechargePaise} onClick={() => void pay('wallet_recharge')}>
                  Pay {formatPaise(Number(amount || 0) * 100 + gst)}
                </Button>
                <Button block variant="outline" loading={busy === 'flat'} onClick={() => void pay('flat_plan')}>
                  {w.plan === 'flat' ? 'Extend flat plan' : 'Switch to flat plan'} · {formatPaise(w.pricing.flatPlanPaise)}/month
                </Button>
              </div>
            </div>
          </section>
        )}

        <section className={s.card}>
          <Tabs value={tab} onChange={setTab} items={[{ value: 'ledger', label: 'Transactions' }, { value: 'invoices', label: 'Invoices' }]} />
          <div style={{ height: 12 }} />
          {tab === 'ledger' ? (
            (ledger.data?.items ?? []).length === 0 ? (
              <EmptyState compact icon="wallet" title="No transactions yet" />
            ) : (
              <div className={s.tableWrap}>
                <table className={s.dataTable}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Details</th>
                      <th className={s.num}>Amount</th>
                      <th className={s.num}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.data!.items.map((l) => (
                      <tr key={l.id}>
                        <td className={s.small}>{DATE.format(new Date(l.createdAt))}</td>
                        <td>{TYPE_LABEL[l.type]}</td>
                        <td className={s.small}>{l.orderNumber ? `Order #${l.orderNumber}` : l.reason ?? ''}</td>
                        <td className={`${s.num} ${l.amountPaise > 0 ? s.pos : s.neg}`}>{l.amountPaise > 0 ? '+' : '−'}{formatPaise(Math.abs(l.amountPaise))}</td>
                        <td className={s.num}>{formatPaise(l.balanceAfterPaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (invoices.data ?? []).length === 0 ? (
            <EmptyState compact icon="receipt" title="No invoices yet" description="An invoice with GST is issued for every recharge." />
          ) : (
            <div className={s.tableWrap}>
              <table className={s.dataTable}>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th className={s.num}>Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invoices.data!.map((i) => (
                    <tr key={i.id}>
                      <td style={{ fontWeight: 600 }}>{i.number}</td>
                      <td className={s.small}>{DATE.format(new Date(i.issuedAt))}</td>
                      <td>{i.description}</td>
                      <td className={s.num}>{formatPaise(i.totalPaise)}</td>
                      <td>
                        <Button size="sm" variant="ghost" icon="download" onClick={() => void openHtml(`/wallet/invoices/${i.id}`)}>
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {w && (
          <p className={s.small}>
            <Badge tone="neutral">How grace works</Badge> If your balance reaches zero, ordering keeps working for {w.pricing.graceHours} hours or down to {formatPaise(w.pricing.graceFloorPaise)}. After that it pauses at your next closing time, never during service.
          </p>
        )}
      </div>
    </div>
  );
}

export default function WalletPage() {
  return (
    <Suspense>
      <WalletInner />
    </Suspense>
  );
}
