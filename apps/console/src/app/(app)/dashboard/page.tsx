'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { type ChecklistDto, type OrderDto, type TableDto, type WalletDto, formatPaise } from '@tableos/schemas';
import { Banner, Button, Icon, type IconName, Skeleton, cx } from '@tableos/ui';
import { PageHeader } from '@/components/Shell';
import { download } from '@/lib/api';
import { useQuery, useStaffSocket } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import s from '@/components/console.module.css';

const STEPS: Array<{ key: keyof ChecklistDto; title: string; body: string; href: string; icon: IconName }> = [
  { key: 'menuPublished', title: 'Add your menu', body: 'Import from photos with AI or add dishes yourself.', href: '/menu', icon: 'menuBook' },
  { key: 'tableCreated', title: 'Add your tables', body: 'Create tables and group them into sections.', href: '/tables', icon: 'table' },
  { key: 'qrDownloaded', title: 'Print QR codes', body: 'Download tent cards for every table.', href: '/tables', icon: 'qr' },
  { key: 'testOrderPlaced', title: 'Place a test order', body: 'Scan a table QR with your phone and order.', href: '/tables', icon: 'bag' },
];

export default function DashboardPage() {
  const router = useRouter();
  const { restaurant, role, can, me } = useSession();
  const manager = can('owner', 'manager');

  useEffect(() => {
    if (role === 'kitchen') router.replace('/kitchen');
    else if (role === 'waiter') router.replace('/waiter');
  }, [role, router]);

  const checklist = useQuery<ChecklistDto>(manager ? '/restaurant/checklist' : null);
  const wallet = useQuery<WalletDto>(manager ? '/wallet' : null);
  const live = useQuery<OrderDto[]>('/orders/live');
  const tables = useQuery<TableDto[]>('/tables');

  useStaffSocket(restaurant?.id ?? null, {
    onOrderCreated: () => void live.reload(),
    onOrderUpdated: () => void live.reload(),
    onSession: () => void tables.reload(),
    onWallet: () => void wallet.reload(),
    onResync: () => void live.reload(),
  });

  const stats = useMemo(() => {
    const orders = live.data ?? [];
    const accepted = orders.filter((o) => ['accepted', 'preparing', 'ready', 'served'].includes(o.status));
    return {
      today: accepted.length,
      waiting: orders.filter((o) => o.status === 'placed').length,
      inKitchen: orders.filter((o) => o.status === 'accepted' || o.status === 'preparing').length,
      sales: accepted.reduce((a, o) => a + o.totalPaise, 0),
      busyTables: (tables.data ?? []).filter((t) => t.openSession).length,
      totalTables: (tables.data ?? []).length,
    };
  }, [live.data, tables.data]);

  const done = checklist.data ? STEPS.filter((st) => checklist.data![st.key]).length : 0;
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

  return (
    <div className={s.page}>
      <PageHeader
        title={`${greeting}${me.user.name ? `, ${me.user.name.split(' ')[0]}` : ''}`}
        subtitle={`${restaurant?.name} · ${restaurant?.orderingEnabled ? 'Ordering is on' : 'Ordering is off'}`}
        actions={
          <>
            <a className={s.sideLink} style={{ width: 'auto', background: 'var(--color-raised)', border: '1px solid var(--color-border)' }} href={`${process.env.NEXT_PUBLIC_MENU_URL}/r/${restaurant?.slug}`} target="_blank" rel="noreferrer">
              <Icon name="external" size={18} /> View menu
            </a>
            <Link href="/orders">
              <Button icon="grid">Live orders</Button>
            </Link>
          </>
        }
      />

      <div className={s.stack}>
        {wallet.data?.orderingPaused && (
          <Banner tone="danger" title="QR ordering is paused" action={<Link href="/wallet"><Button size="sm" variant="danger">Recharge</Button></Link>}>
            Your wallet balance is {formatPaise(wallet.data.balancePaise)}. Your menu still works in view-only mode.
          </Banner>
        )}
        {wallet.data && !wallet.data.orderingPaused && wallet.data.lowBalance && wallet.data.plan === 'payg' && (
          <Banner tone="warning" title="Wallet balance is low" action={<Link href="/wallet"><Button size="sm" variant="dark">Recharge</Button></Link>}>
            {formatPaise(wallet.data.balancePaise)} left.
            {wallet.data.graceEndsAt ? ` Ordering pauses after ${new Date(wallet.data.graceEndsAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} at your closing time.` : ' Recharge to keep taking orders.'}
          </Banner>
        )}

        <div className={s.grid4}>
          <Stat icon="bag" label="Orders today" value={live.loading && !live.data ? null : String(stats.today)} hint={`${stats.waiting} waiting · ${stats.inKitchen} in kitchen`} />
          <Stat icon="rupee" label="Order value today" value={live.loading && !live.data ? null : formatPaise(stats.sales)} hint="Accepted orders, before discounts" />
          <Stat icon="table" label="Tables in use" value={tables.loading && !tables.data ? null : `${stats.busyTables}/${stats.totalTables}`} hint="Open table sessions" />
          {manager ? (
            <Stat icon="wallet" label="Wallet" value={wallet.loading && !wallet.data ? null : wallet.data?.plan === 'flat' ? 'Flat plan' : formatPaise(wallet.data?.balancePaise ?? 0)} hint={wallet.data ? `${formatPaise(wallet.data.month.feesChargedPaise)} of ${formatPaise(wallet.data.month.capPaise)} cap used` : ''} />
          ) : (
            <Stat icon="clock" label="Waiting to accept" value={String(stats.waiting)} hint="First orders of new tables" />
          )}
        </div>

        <div className={s.grid2}>
          {manager && (
            <section className={s.card}>
              <div className={s.cardHead}>
                <div>
                  <h2 className={s.cardTitle}>Get ready to go live</h2>
                  <p className={s.small}>{done} of 4 done</p>
                </div>
                <span className={s.statIcon}>
                  <Icon name="sparkles" size={18} />
                </span>
              </div>
              <div className={cx(s.progress, done === 4 && s.progressGreen)} style={{ marginBottom: 16 }}>
                <span style={{ width: `${(done / 4) * 100}%` }} />
              </div>
              <div className={s.checklist}>
                {STEPS.map((st) => {
                  const ok = checklist.data?.[st.key];
                  const content = (
                    <>
                      <span className={s.checkCircle}>{ok && <Icon name="check" size={16} strokeWidth={3} />}</span>
                      <span className={s.checkText}>
                        <strong>{st.title}</strong>
                        <span className={s.small}>{st.body}</span>
                      </span>
                      {!ok && <Icon name="chevronRight" size={18} />}
                    </>
                  );
                  return st.key === 'qrDownloaded' && !ok && checklist.data?.tableCreated ? (
                    <button key={st.key} type="button" className={s.checkItem} style={{ textAlign: 'left' }} onClick={() => void download('/tables/qr.pdf', 'table-qr-codes.pdf').then(() => checklist.reload())}>
                      {content}
                    </button>
                  ) : (
                    <Link key={st.key} href={st.href} className={cx(s.checkItem, ok && s.checkDone)}>
                      {content}
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          <section className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>Recent orders</h2>
              <Link href="/orders" className={s.small} style={{ color: 'var(--color-brand)', fontWeight: 700 }}>
                See all
              </Link>
            </div>
            {live.loading && !live.data ? (
              <div className={s.stack}>
                <Skeleton height={44} />
                <Skeleton height={44} />
                <Skeleton height={44} />
              </div>
            ) : (live.data ?? []).length === 0 ? (
              <p className={s.muted}>No orders yet today. Orders appear here the moment guests place them.</p>
            ) : (
              <div className={s.tableWrap}>
                <table className={s.dataTable}>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Table</th>
                      <th>Status</th>
                      <th className={s.num}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(live.data ?? [])]
                      .reverse()
                      .slice(0, 8)
                      .map((o) => (
                        <tr key={o.id}>
                          <td>#{o.number}</td>
                          <td>{o.table.label}</td>
                          <td style={{ textTransform: 'capitalize' }}>{o.status}</td>
                          <td className={s.num}>{formatPaise(o.totalPaise)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, hint }: { icon: IconName; label: string; value: string | null; hint?: string }) {
  return (
    <section className={s.card}>
      <div className={s.stat}>
        <span className={s.statLabel}>
          <span className={s.statIcon}>
            <Icon name={icon} size={16} />
          </span>
          {label}
        </span>
        {value === null ? <Skeleton width={120} height={34} /> : <span className={s.statValue}>{value}</span>}
        {hint && <span className={s.statHint}>{hint}</span>}
      </div>
    </section>
  );
}
