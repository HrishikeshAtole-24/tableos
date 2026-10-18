'use client';

import { useState } from 'react';
import { type InsightsDto, formatPaise } from '@tableos/schemas';
import { EmptyState, Icon, type IconName, Segmented, Skeleton } from '@tableos/ui';
import { PageHeader } from '@/components/Shell';
import { useQuery } from '@/lib/hooks';
import s from '@/components/console.module.css';

export default function InsightsPage() {
  const [days, setDays] = useState('7');
  const q = useQuery<InsightsDto>(`/insights?days=${days}`, [days]);
  const d = q.data;
  const maxDay = Math.max(1, ...(d?.byDay.map((x) => x.salesPaise) ?? [1]));
  const maxHour = Math.max(1, ...(d?.byHour.map((x) => x.orders) ?? [1]));
  const maxDish = Math.max(1, ...(d?.topDishes.map((x) => x.qty) ?? [1]));
  const hours = d?.byHour.filter((h) => h.hour >= 8 && h.hour <= 23) ?? [];

  return (
    <div className={s.page}>
      <PageHeader
        title="Insights"
        subtitle="What sells, when you are busiest, and what guests look at but skip."
        actions={<Segmented value={days} onChange={setDays} items={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />}
      />
      {!d ? (
        <div className={s.grid4}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={110} radius={16} />
          ))}
        </div>
      ) : (
        <div className={s.stack}>
          <div className={s.grid4}>
            <Kpi icon="rupee" label="Sales (paid bills)" value={formatPaise(d.totals.salesPaise)} />
            <Kpi icon="bag" label="Accepted orders" value={String(d.totals.orders)} />
            <Kpi icon="receipt" label="Average bill" value={formatPaise(d.totals.avgBillPaise)} />
            <Kpi icon="qr" label="Tables that ordered by QR" value={`${Math.round(d.totals.scanToOrderRate * 100)}%`} hint={`${d.totals.sessions} table sessions`} />
          </div>
          <div className={s.grid2}>
            <section className={s.card}>
              <h2 className={s.cardTitle}>Sales by day</h2>
              <div className={s.bars} role="img" aria-label="Sales by day chart">
                {d.byDay.slice(-14).map((x) => (
                  <div key={x.date} className={s.barCol} title={`${x.date}: ${formatPaise(x.salesPaise)}`}>
                    <div className={`${s.bar} ${x.salesPaise === 0 ? s.barMuted : ''}`} style={{ height: `${(x.salesPaise / maxDay) * 100}%` }} />
                    <span className={s.barLabel}>{new Date(x.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className={s.card}>
              <h2 className={s.cardTitle}>Busiest hours</h2>
              <div className={s.bars} role="img" aria-label="Orders by hour chart">
                {hours.map((x) => (
                  <div key={x.hour} className={s.barCol} title={`${x.hour}:00 · ${x.orders} orders`}>
                    <div className={`${s.bar} ${x.orders === 0 ? s.barMuted : ''}`} style={{ height: `${(x.orders / maxHour) * 100}%` }} />
                    <span className={s.barLabel}>{x.hour % 12 || 12}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div className={s.grid2}>
            <section className={s.card}>
              <h2 className={s.cardTitle}>Top dishes</h2>
              {d.topDishes.length === 0 ? (
                <EmptyState compact icon="chart" title="No orders in this period" />
              ) : (
                <ol className={s.rankList} style={{ marginTop: 16 }}>
                  {d.topDishes.map((x, i) => (
                    <li key={x.itemId} className={s.rankItem}>
                      <strong className={s.muted}>{i + 1}</strong>
                      <div>
                        <div>{x.name}</div>
                        <div className={s.rankBar}>
                          <span style={{ width: `${(x.qty / maxDish) * 100}%` }} />
                        </div>
                      </div>
                      <span className={s.small}>
                        {x.qty} sold · {formatPaise(x.salesPaise)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section className={s.card}>
              <h2 className={s.cardTitle}>Viewed but not ordered</h2>
              <p className={s.small}>Guests open these often but rarely order. Try a better photo, description or price.</p>
              {d.viewedNotOrdered.length === 0 ? (
                <EmptyState compact icon="eye" title="Nothing stands out yet" />
              ) : (
                <ul className={s.rankList} style={{ marginTop: 16 }}>
                  {d.viewedNotOrdered.map((x) => (
                    <li key={x.itemId} className={s.between}>
                      <span>{x.name}</span>
                      <span className={s.small}>
                        {x.views} views · {x.orders} orders
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, hint }: { icon: IconName; label: string; value: string; hint?: string }) {
  return (
    <section className={s.card}>
      <div className={s.stat}>
        <span className={s.statLabel}>
          <span className={s.statIcon}>
            <Icon name={icon} size={16} />
          </span>
          {label}
        </span>
        <span className={s.statValue}>{value}</span>
        {hint && <span className={s.statHint}>{hint}</span>}
      </div>
    </section>
  );
}
