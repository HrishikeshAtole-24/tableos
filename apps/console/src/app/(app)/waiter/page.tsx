'use client';

import { useState } from 'react';
import { type MenuCategoryDto, type OrderDto, type ServiceRequestDto, type TableDto } from '@tableos/schemas/client';
import { Badge, Button, EmptyState, Icon, type IconName, IconButton, useToast } from '@tableos/ui';
import { PageHeader } from '@/components/Shell';
import { BillPanel, OrderCard, RejectSheet, StaffOrderSheet } from '@/components/orders';
import { ApiError, api } from '@/lib/api';
import { useChime, useNow, useQuery, useStaffSocket } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import s from '@/components/console.module.css';

const REQ: Record<string, { icon: IconName; label: string }> = {
  waiter: { icon: 'waiter', label: 'Needs a waiter' },
  water: { icon: 'water', label: 'Wants water' },
  bill: { icon: 'receipt', label: 'Asked for the bill' },
};

/** Waiter view: request queue, first-order acceptance, ready-to-serve, staff orders. */
export default function WaiterPage() {
  const { restaurant, can } = useSession();
  const toast = useToast();
  const now = useNow(15_000);
  const chime = useChime();
  const [rejecting, setRejecting] = useState<OrderDto | null>(null);
  const [billFor, setBillFor] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const requests = useQuery<ServiceRequestDto[]>('/service-requests');
  const orders = useQuery<OrderDto[]>('/orders/live');
  const tables = useQuery<TableDto[]>('/tables');
  const menu = useQuery<MenuCategoryDto[]>(ordering ? '/menu' : null, [ordering]);

  const upsert = (o: OrderDto) => orders.setData((cur) => (cur ? (cur.some((x) => x.id === o.id) ? cur.map((x) => (x.id === o.id ? o : x)) : [...cur, o]) : [o]));
  const connected = useStaffSocket(restaurant?.id ?? null, {
    onRequestCreated: (r) => {
      requests.setData((cur) => [...(cur ?? []), r]);
      chime.play();
    },
    onRequestUpdated: (r) => requests.setData((cur) => (cur ?? []).filter((x) => !(x.id === r.id && r.status !== 'open'))),
    onOrderCreated: (o) => {
      upsert(o);
      if (o.status === 'placed') chime.play();
    },
    onOrderUpdated: (o) => {
      upsert(o);
      if (o.status === 'ready') chime.play();
    },
    onSession: () => void tables.reload(),
    onResync: () => {
      void requests.reload();
      void orders.reload();
    },
  });

  const ack = async (r: ServiceRequestDto) => {
    try {
      await api(`/service-requests/${r.id}/ack`, { method: 'PATCH' });
      requests.setData((cur) => (cur ?? []).filter((x) => x.id !== r.id));
      if (r.type === 'bill') setBillFor(r.sessionId);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not acknowledge');
    }
  };

  const toAccept = (orders.data ?? []).filter((o) => o.status === 'placed');
  const toServe = (orders.data ?? []).filter((o) => o.status === 'ready');

  return (
    <div className={s.page} style={{ maxWidth: 820 }}>
      <PageHeader
        title="Floor"
        subtitle={<Badge tone={connected ? 'success' : 'warning'}>{connected ? 'Live' : 'Reconnecting'}</Badge>}
        actions={
          <>
            <IconButton icon={chime.enabled ? 'volume' : 'volumeOff'} label="Sound" onClick={chime.enable} filled />
            <Button icon="plus" onClick={() => setOrdering(true)}>
              Order for table
            </Button>
          </>
        }
      />
      <div className={s.stack}>
        <section>
          <h2 className={s.label}>Requests ({(requests.data ?? []).length})</h2>
          <div className={s.reqList}>
            {(requests.data ?? []).length === 0 && <EmptyState compact icon="bell" title="No requests" description="Water, waiter and bill requests appear here." />}
            {(requests.data ?? []).map((r) => {
              const meta = REQ[r.type]!;
              const mins = Math.floor((now - new Date(r.createdAt).getTime()) / 60000);
              return (
                <div key={r.id} className={s.reqItem}>
                  <span className={s.reqIcon}>
                    <Icon name={meta.icon} size={24} />
                  </span>
                  <div className={s.reqText}>
                    <strong>Table {r.table.label}</strong>
                    <span className={s.small}>
                      {meta.label} · {mins < 1 ? 'just now' : `${mins} min ago`}
                    </span>
                  </div>
                  <Button variant={r.type === 'bill' ? 'success' : 'primary'} onClick={() => void ack(r)}>
                    {r.type === 'bill' ? 'Open bill' : 'On my way'}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className={s.label}>New tables to accept ({toAccept.length})</h2>
          <div className={s.stack}>
            {toAccept.length === 0 && <p className={s.small}>Nothing waiting.</p>}
            {toAccept.map((o) => (
              <OrderCard key={o.id} order={o} now={now} onChange={upsert} onReject={setRejecting} canAccept canCook={false} canServe />
            ))}
          </div>
        </section>

        <section>
          <h2 className={s.label}>Ready to serve ({toServe.length})</h2>
          <div className={s.stack}>
            {toServe.length === 0 && <p className={s.small}>Nothing ready yet.</p>}
            {toServe.map((o) => (
              <OrderCard key={o.id} order={o} now={now} onChange={upsert} onReject={setRejecting} canAccept={false} canCook={false} canServe />
            ))}
          </div>
        </section>
      </div>
      <RejectSheet order={rejecting} onClose={() => setRejecting(null)} onDone={upsert} />
      <BillPanel sessionId={billFor} onClose={() => setBillFor(null)} canDiscount={can('owner', 'manager')} />
      {ordering && tables.data && <StaffOrderSheet open onClose={() => setOrdering(false)} tables={tables.data} menu={menu.data ?? []} onPlaced={upsert} />}
    </div>
  );
}
