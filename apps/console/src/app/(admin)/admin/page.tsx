'use client';

import Link from 'next/link';
import { useState } from 'react';
import { type PlatformMetricsDto, type RestaurantDto, formatPaise } from '@tableos/schemas/client';
import { Badge, Button, EmptyState, Input, Logo, Select, Sheet, Skeleton, Tabs, Textarea, useToast } from '@tableos/ui';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { SessionProvider, useSession } from '@/lib/session';
import s from '@/components/console.module.css';

type AdminRestaurant = RestaurantDto & { walletBalancePaise: number; orderingPaused: boolean; owner: { email: string | null; name: string | null } | null; orderCount: number; tableCount: number; featureFlags: string[] };
interface Pricing {
  id: string;
  feePerOrderPaise: number;
  monthlyCapPaise: number;
  flatPlanPaise: number;
  minRechargePaise: number;
  alertLevelsPaise: number[];
  graceFloorPaise: number;
  graceHours: number;
  gstRateBp: number;
}

function Admin() {
  const { me } = useSession();
  const [tab, setTab] = useState<'overview' | 'restaurants' | 'pricing' | 'imports' | 'audit'>('overview');
  if (!me.user.isPlatformAdmin) return <EmptyState icon="lock" title="Platform admins only" />;
  return (
    <div className={s.shell} style={{ display: 'block' }}>
      <header className={s.mobileTop} style={{ display: 'flex' }}>
        <div className={s.row}>
          <Logo size={26} />
          <Badge tone="dark">Admin</Badge>
        </div>
        <Link href="/dashboard" className={s.small} style={{ fontWeight: 700 }}>
          Back to dashboard
        </Link>
      </header>
      <div className={s.page}>
        <h1 className={s.pageTitle} style={{ marginBottom: 16 }}>
          Platform admin
        </h1>
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'overview', label: 'Overview' },
            { value: 'restaurants', label: 'Restaurants' },
            { value: 'pricing', label: 'Pricing' },
            { value: 'imports', label: 'AI imports' },
            { value: 'audit', label: 'Audit log' },
          ]}
        />
        <div style={{ height: 20 }} />
        {tab === 'overview' && <Overview />}
        {tab === 'restaurants' && <Restaurants />}
        {tab === 'pricing' && <PricingTab />}
        {tab === 'imports' && <Imports />}
        {tab === 'audit' && <Audit />}
      </div>
    </div>
  );
}

function Overview() {
  const m = useQuery<PlatformMetricsDto>('/admin/metrics');
  if (!m.data) return <Skeleton height={200} radius={16} />;
  const d = m.data;
  return (
    <div className={s.stack}>
      <div className={s.grid4}>
        {[
          ['Active restaurants (30d)', `${d.activeRestaurants} / ${d.totalRestaurants}`],
          ['Accepted orders (30d)', d.acceptedOrders30d.toLocaleString('en-IN')],
          ['Recharge volume (30d)', formatPaise(d.rechargeVolume30dPaise)],
          ['Fee revenue (30d)', formatPaise(d.feeRevenue30dPaise)],
        ].map(([l, v]) => (
          <section key={l} className={s.card}>
            <div className={s.stat}>
              <span className={s.statLabel}>{l}</span>
              <span className={s.statValue}>{v}</span>
            </div>
          </section>
        ))}
      </div>
      <section className={s.card}>
        <div className={s.cardHead}>
          <h2 className={s.cardTitle}>Payment provider health (7 days)</h2>
          <Badge tone={d.importsFailed7d ? 'warning' : 'success'}>{d.importsFailed7d} failed imports</Badge>
        </div>
        {d.providerHealth.length === 0 ? (
          <p className={s.muted}>No payment attempts yet.</p>
        ) : (
          <table className={s.dataTable}>
            <thead>
              <tr>
                <th>Provider</th>
                <th className={s.num}>Attempts</th>
                <th className={s.num}>Success rate</th>
                <th className={s.num}>Avg webhook delay</th>
              </tr>
            </thead>
            <tbody>
              {d.providerHealth.map((p) => (
                <tr key={p.provider}>
                  <td style={{ textTransform: 'capitalize' }}>{p.provider}</td>
                  <td className={s.num}>{p.attempts}</td>
                  <td className={s.num}>
                    <Badge tone={p.successRate >= 0.95 ? 'success' : p.successRate >= 0.8 ? 'warning' : 'danger'}>{Math.round(p.successRate * 100)}%</Badge>
                  </td>
                  <td className={s.num}>{p.avgWebhookDelayMs === null ? '—' : `${(p.avgWebhookDelayMs / 1000).toFixed(1)} s`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Restaurants() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const list = useQuery<{ items: AdminRestaurant[] }>(`/admin/restaurants?limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`, [search]);
  const [selected, setSelected] = useState<AdminRestaurant | null>(null);
  const [mode, setMode] = useState<'status' | 'wallet' | null>(null);
  const [status, setStatus] = useState('active');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      if (mode === 'status') await api(`/admin/restaurants/${selected.id}/status`, { method: 'PATCH', body: { status, reason } });
      else await api('/admin/wallet-adjustments', { method: 'POST', body: { restaurantId: selected.id, amountPaise: Math.round(Number(amount) * 100), reason } });
      toast.success('Saved and audited');
      setMode(null);
      setReason('');
      setAmount('');
      void list.reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <h2 className={s.cardTitle}>Restaurants</h2>
        <div style={{ maxWidth: 300, width: '100%' }}>
          <Input icon="search" placeholder="Search name, link or city" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className={s.tableWrap}>
        <table className={s.dataTable}>
          <thead>
            <tr>
              <th>Restaurant</th>
              <th>Owner</th>
              <th>Status</th>
              <th className={s.num}>Wallet</th>
              <th className={s.num}>Orders</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.name}</strong>
                  <div className={s.small}>
                    /r/{r.slug} · {r.city ?? '—'}
                  </div>
                </td>
                <td className={s.small}>{r.owner?.email ?? '—'}</td>
                <td>
                  <Badge tone={r.status === 'active' ? 'success' : r.status === 'suspended' ? 'warning' : 'danger'}>{r.status}</Badge>
                  {r.orderingPaused && <div className={s.small}>Ordering paused</div>}
                </td>
                <td className={s.num}>{formatPaise(r.walletBalancePaise)}</td>
                <td className={s.num}>{r.orderCount}</td>
                <td>
                  <div className={s.row} style={{ gap: 4, justifyContent: 'flex-end' }}>
                    <Button size="sm" variant="ghost" icon="eye" onClick={() => { localStorage.setItem('tos-restaurant', r.id); window.location.href = '/dashboard'; }}>
                      Support view
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setSelected(r); setStatus(r.status); setMode('status'); }}>
                      Status
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setSelected(r); setMode('wallet'); }}>
                      Adjust wallet
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Sheet open={mode !== null} onClose={() => setMode(null)} placement="center" size="sm" title={mode === 'status' ? `Status of ${selected?.name}` : `Adjust wallet of ${selected?.name}`} footer={<Button block loading={busy} disabled={reason.trim().length < 5 || (mode === 'wallet' && !Number(amount))} onClick={() => void submit()}>Save</Button>}>
        <div className={s.stack}>
          {mode === 'status' ? (
            <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'closed', label: 'Closed' }]} />
          ) : (
            <Input label="Amount (₹)" hint="Negative to debit" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.-]/g, ''))} />
          )}
          <Textarea label="Reason (required, audited)" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </Sheet>
    </section>
  );
}

function PricingTab() {
  const toast = useToast();
  const cfg = useQuery<Pricing>('/admin/pricing-config');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (!cfg.data) return <Skeleton height={300} radius={16} />;
  const c = cfg.data;
  const field = (key: keyof Pricing, label: string, unit: 'rupees' | 'hours' | 'percent') => {
    const raw = c[key] as number;
    const shown = unit === 'rupees' ? raw / 100 : unit === 'percent' ? raw / 100 : raw;
    return <Input key={key} label={label} suffix={unit === 'rupees' ? '₹' : unit === 'percent' ? '%' : 'h'} value={draft[key] ?? String(shown)} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} />;
  };
  const save = async () => {
    setBusy(true);
    try {
      const conv = (k: keyof Pricing, unit: 'rupees' | 'hours' | 'percent') => (draft[k] === undefined ? undefined : unit === 'hours' ? Math.round(Number(draft[k])) : Math.round(Number(draft[k]) * 100));
      const body: Record<string, unknown> = { restaurantId: null };
      const pairs: Array<[keyof Pricing, 'rupees' | 'hours' | 'percent']> = [['feePerOrderPaise', 'rupees'], ['monthlyCapPaise', 'rupees'], ['flatPlanPaise', 'rupees'], ['minRechargePaise', 'rupees'], ['graceFloorPaise', 'rupees'], ['graceHours', 'hours'], ['gstRateBp', 'percent']];
      for (const [k, u] of pairs) {
        const v = conv(k, u);
        if (v !== undefined) body[k] = v;
      }
      if (draft.alertLevelsPaise !== undefined) body.alertLevelsPaise = draft.alertLevelsPaise.split(',').map((x) => Math.round(Number(x.trim()) * 100)).filter((x) => x > 0);
      cfg.setData(await api<Pricing>('/admin/pricing-config', { method: 'PUT', body }));
      setDraft({});
      toast.success('Pricing updated. Applies immediately, no deploy needed.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={s.card} style={{ maxWidth: 760 }}>
      <h2 className={s.cardTitle}>Global pricing config</h2>
      <p className={s.small}>Every change is audited. Restaurant-specific overrides can be set through the API.</p>
      <div className={s.formGrid}>
        {field('feePerOrderPaise', 'Fee per accepted order', 'rupees')}
        {field('monthlyCapPaise', 'Monthly cap', 'rupees')}
        {field('flatPlanPaise', 'Flat plan per month', 'rupees')}
        {field('minRechargePaise', 'Minimum recharge', 'rupees')}
        {field('graceFloorPaise', 'Grace floor (negative)', 'rupees')}
        {field('graceHours', 'Grace hours', 'hours')}
        {field('gstRateBp', 'GST on fees', 'percent')}
        <Input label="Alert levels (₹, comma separated)" value={draft.alertLevelsPaise ?? c.alertLevelsPaise.map((x) => x / 100).join(', ')} onChange={(e) => setDraft((d) => ({ ...d, alertLevelsPaise: e.target.value }))} />
      </div>
      <div style={{ marginTop: 20 }}>
        <Button loading={busy} disabled={!Object.keys(draft).length} onClick={() => void save()}>
          Save pricing
        </Button>
      </div>
    </section>
  );
}

function Imports() {
  const toast = useToast();
  const list = useQuery<Array<{ id: string; restaurant: { name: string }; status: string; fileCount: number; attempts: number; error: string | null; createdAt: string }>>('/admin/imports');
  return (
    <section className={s.card}>
      <h2 className={s.cardTitle}>AI import queue</h2>
      {(list.data ?? []).length === 0 ? (
        <EmptyState compact icon="sparkles" title="No imports yet" />
      ) : (
        <div className={s.tableWrap}>
          <table className={s.dataTable}>
            <thead>
              <tr>
                <th>Restaurant</th>
                <th>Status</th>
                <th>Files</th>
                <th>Error</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data!.map((m) => (
                <tr key={m.id}>
                  <td>{m.restaurant.name}</td>
                  <td>
                    <Badge tone={m.status === 'failed' ? 'danger' : m.status === 'published' ? 'success' : m.status === 'ready' ? 'info' : 'warning'}>{m.status}</Badge>
                  </td>
                  <td>{m.fileCount}</td>
                  <td className={s.small} style={{ maxWidth: 280 }}>{m.error ?? '—'}</td>
                  <td className={s.small}>{new Date(m.createdAt).toLocaleString('en-IN')}</td>
                  <td>
                    {m.status === 'failed' && (
                      <Button size="sm" variant="ghost" icon="refresh" onClick={() => void api(`/admin/imports/${m.id}/retry`, { method: 'POST' }).then(() => { toast.success('Queued'); void list.reload(); })}>
                        Retry
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Audit() {
  const [action, setAction] = useState('');
  const logs = useQuery<{ items: Array<{ id: string; actor: { email: string | null } | null; action: string; entityType: string; entityId: string | null; after: unknown; createdAt: string }> }>(`/admin/audit-logs?limit=100${action ? `&action=${encodeURIComponent(action)}` : ''}`, [action]);
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <h2 className={s.cardTitle}>Audit log</h2>
        <div style={{ maxWidth: 260, width: '100%' }}>
          <Input icon="filter" placeholder="Filter by action, e.g. wallet" value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
      </div>
      <div className={s.tableWrap}>
        <table className={s.dataTable}>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {(logs.data?.items ?? []).map((l) => (
              <tr key={l.id}>
                <td className={s.small}>{new Date(l.createdAt).toLocaleString('en-IN')}</td>
                <td className={s.small}>{l.actor?.email ?? 'system'}</td>
                <td>
                  <Badge>{l.action}</Badge>
                </td>
                <td className={s.small} style={{ maxWidth: 360, wordBreak: 'break-word' }}>
                  {l.after ? JSON.stringify(l.after).slice(0, 160) : l.entityId ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AdminPage() {
  return (
    <SessionProvider requireRestaurant={false}>
      <Admin />
    </SessionProvider>
  );
}
