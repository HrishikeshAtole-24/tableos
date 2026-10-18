'use client';

import { useMemo, useState } from 'react';
import { type MenuCategoryDto, type OrderDto, type TableDto, formatPaise } from '@tableos/schemas/client';
import { Badge, Button, EmptyState, Icon, IconButton, Skeleton, Tabs, cx, useToast } from '@tableos/ui';
import { PageHeader } from '@/components/Shell';
import { BillPanel, OrderCard, RejectSheet, StaffOrderSheet } from '@/components/orders';
import { useChime, useNow, useQuery, useStaffSocket } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import s from '@/components/console.module.css';

const COLUMNS = [
  { status: 'placed', title: 'New', color: 'var(--color-warning)' },
  { status: 'accepted', title: 'Accepted', color: 'var(--color-info)' },
  { status: 'preparing', title: 'Preparing', color: 'var(--color-brand)' },
  { status: 'ready', title: 'Ready to serve', color: 'var(--color-success)' },
] as const;

export default function OrdersPage() {
  const { restaurant, can } = useSession();
  const toast = useToast();
  const now = useNow(15_000);
  const chime = useChime();
  const [tab, setTab] = useState<'board' | 'tables' | 'done'>('board');
  const [rejecting, setRejecting] = useState<OrderDto | null>(null);
  const [billFor, setBillFor] = useState<string | null>(null);
  const [newOrder, setNewOrder] = useState<{ open: boolean; tableId: string | null }>({ open: false, tableId: null });
  const orders = useQuery<OrderDto[]>('/orders/live');
  const tables = useQuery<TableDto[]>('/tables');
  const menu = useQuery<MenuCategoryDto[]>(newOrder.open ? '/menu' : null, [newOrder.open]);

  const upsert = (o: OrderDto) => orders.setData((cur) => (cur ? (cur.some((x) => x.id === o.id) ? cur.map((x) => (x.id === o.id ? o : x)) : [...cur, o]) : [o]));
  const connected = useStaffSocket(restaurant?.id ?? null, {
    onOrderCreated: (o) => {
      upsert(o);
      chime.play();
      if (o.status === 'placed') toast.show(`New order from ${o.table.label}`, { tone: 'warning' });
      void tables.reload();
    },
    onOrderUpdated: (o) => {
      upsert(o);
      void tables.reload();
    },
    onSession: () => void tables.reload(),
    onResync: () => {
      void orders.reload();
      void tables.reload();
    },
  });

  const grouped = useMemo(() => {
    const g: Record<string, OrderDto[]> = { placed: [], accepted: [], preparing: [], ready: [] };
    for (const o of orders.data ?? []) g[o.status]?.push(o);
    return g;
  }, [orders.data]);
  const done = (orders.data ?? []).filter((o) => ['served', 'rejected', 'cancelled'].includes(o.status)).reverse();
  const busyTables = (tables.data ?? []).filter((t) => t.openSession).length;

  return (
    <div className={s.page}>
      <PageHeader
        title="Live orders"
        subtitle={
          <span className={s.row} style={{ gap: 8 }}>
            <Badge tone={connected ? 'success' : 'warning'} pulse={!connected}>
              {connected ? 'Live' : 'Reconnecting'}
            </Badge>
            {grouped.placed!.length} waiting · {busyTables} tables in use
          </span>
        }
        actions={
          <>
            <IconButton icon={chime.enabled ? 'volume' : 'volumeOff'} label={chime.enabled ? 'Sound on' : 'Turn on sound'} onClick={chime.enable} filled />
            {can('owner', 'manager', 'waiter') && (
              <Button icon="plus" onClick={() => setNewOrder({ open: true, tableId: null })}>
                New order
              </Button>
            )}
          </>
        }
      />
      {!chime.enabled && (
        <button type="button" className={s.checkItem} style={{ width: '100%', marginBottom: 16, background: 'var(--color-warning-soft)', borderColor: 'transparent' }} onClick={chime.enable}>
          <Icon name="volume" size={20} /> <strong>Tap to turn on the new-order sound</strong>
        </button>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        className=""
        items={[
          { value: 'board', label: 'Board', count: (orders.data ?? []).filter((o) => COLUMNS.some((c) => c.status === o.status)).length },
          { value: 'tables', label: 'Tables', count: busyTables },
          { value: 'done', label: 'Completed today', count: done.length },
        ]}
      />
      <div style={{ height: 20 }} />

      {tab === 'board' &&
        (orders.loading && !orders.data ? (
          <div className={s.board}>
            {COLUMNS.map((c) => (
              <div key={c.status} className={s.boardCol}>
                <Skeleton height={140} />
              </div>
            ))}
          </div>
        ) : (
          <div className={s.board}>
            {COLUMNS.map((c) => (
              <section key={c.status} className={s.boardCol} aria-label={c.title}>
                <h2 className={s.boardColHead}>
                  <span className={s.boardDot} style={{ background: c.color }} />
                  {c.title}
                  <span className={s.boardCount}>{grouped[c.status]!.length}</span>
                </h2>
                {grouped[c.status]!.length === 0 ? (
                  <p className={s.small} style={{ padding: '24px 8px', textAlign: 'center' }}>
                    Nothing here
                  </p>
                ) : (
                  grouped[c.status]!.map((o) => (
                    <OrderCard key={o.id} order={o} now={now} onChange={upsert} onReject={setRejecting} canAccept={can('owner', 'manager', 'waiter')} canCook={can('owner', 'manager')} canServe={can('owner', 'manager', 'waiter')} />
                  ))
                )}
              </section>
            ))}
          </div>
        ))}

      {tab === 'tables' && (
        <div className={s.tableGrid}>
          {(tables.data ?? []).length === 0 && <EmptyState icon="table" title="No tables yet" description="Add tables in Tables & QR." />}
          {(tables.data ?? [])
            .filter((t) => t.active)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                className={cx(s.tableTile, t.openSession && (t.openSession.status === 'bill_requested' ? s.tableBill : s.tableBusy))}
                onClick={() => (t.openSession ? setBillFor(t.openSession.id) : setNewOrder({ open: true, tableId: t.id }))}
              >
                <span className={s.small}>{t.section ?? 'Table'}</span>
                <strong>{t.label}</strong>
                {t.openSession ? (
                  <>
                    <span style={{ font: 'var(--text-title)' }}>{formatPaise(t.openSession.runningTotalPaise)}</span>
                    <span className={s.small}>{t.openSession.status === 'bill_requested' ? 'Bill requested' : `Since ${new Date(t.openSession.openedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`}</span>
                  </>
                ) : (
                  <span className={s.small}>Free · tap to order</span>
                )}
              </button>
            ))}
        </div>
      )}

      {tab === 'done' && (
        <section className={s.card}>
          {done.length === 0 ? (
            <EmptyState compact icon="check" title="Nothing completed yet today" />
          ) : (
            <div className={s.tableWrap}>
              <table className={s.dataTable}>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Table</th>
                    <th>Items</th>
                    <th>Status</th>
                    <th className={s.num}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {done.map((o) => (
                    <tr key={o.id}>
                      <td>#{o.number}</td>
                      <td>{o.table.label}</td>
                      <td>{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</td>
                      <td>
                        <Badge tone={o.status === 'served' ? 'success' : 'danger'}>{o.status}</Badge>
                        {o.rejectReason && <div className={s.small}>{o.rejectReason}</div>}
                      </td>
                      <td className={s.num}>{formatPaise(o.totalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <RejectSheet order={rejecting} onClose={() => setRejecting(null)} onDone={upsert} />
      <BillPanel sessionId={billFor} onClose={() => { setBillFor(null); void tables.reload(); }} canDiscount={can('owner', 'manager')} />
      {newOrder.open && tables.data && (
        <StaffOrderSheet open onClose={() => setNewOrder({ open: false, tableId: null })} tables={tables.data} menu={menu.data ?? []} initialTableId={newOrder.tableId} onPlaced={(o) => { upsert(o); void tables.reload(); }} />
      )}
    </div>
  );
}
