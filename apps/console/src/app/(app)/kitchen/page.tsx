'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { OrderDto } from '@tableos/schemas';
import { Icon, cx, useToast } from '@tableos/ui';
import { setStatus } from '@/components/orders';
import { ApiError } from '@/lib/api';
import { useChime, useNow, useQuery, useStaffSocket } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import s from '@/components/console.module.css';

function mmss(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Kitchen display: one ticket per accepted order, tap to move to Preparing then Ready. */
export default function KitchenPage() {
  const { restaurant, role } = useSession();
  const toast = useToast();
  const now = useNow(1000);
  const chime = useChime();
  const [busy, setBusy] = useState<string | null>(null);
  const orders = useQuery<OrderDto[]>('/orders/live');
  const upsert = (o: OrderDto) => orders.setData((cur) => (cur ? (cur.some((x) => x.id === o.id) ? cur.map((x) => (x.id === o.id ? o : x)) : [...cur, o]) : [o]));

  const connected = useStaffSocket(restaurant?.id ?? null, {
    onOrderCreated: (o) => {
      upsert(o);
      if (o.status === 'accepted') chime.play(true);
    },
    onOrderUpdated: (o) => {
      const before = orders.data?.find((x) => x.id === o.id);
      upsert(o);
      if (o.status === 'accepted' && before?.status === 'placed') chime.play(true);
    },
    onResync: () => void orders.reload(),
  });

  const tickets = useMemo(
    () => (orders.data ?? []).filter((o) => o.status === 'accepted' || o.status === 'preparing').sort((a, b) => new Date(a.acceptedAt ?? a.createdAt).getTime() - new Date(b.acceptedAt ?? b.createdAt).getTime()),
    [orders.data],
  );

  const advance = async (o: OrderDto) => {
    setBusy(o.id);
    try {
      upsert(await setStatus(o.id, o.status === 'accepted' ? 'preparing' : 'ready'));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not update');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={s.kds} style={{ position: 'fixed', inset: 0, zIndex: 40, overflowY: 'auto' }}>
      <header className={s.kdsHeader}>
        <div className={s.row}>
          <h1>Kitchen</h1>
          <span className={s.kdsStatus}>
            <span className={cx(s.kdsLive, !connected && s.kdsOff)} /> {connected ? `${tickets.length} open` : 'Reconnecting…'}
          </span>
        </div>
        <div className={s.row}>
          <button type="button" className={s.kdsBtn} onClick={() => void document.documentElement.requestFullscreen?.()}>
            <Icon name="maximize" size={18} /> Full screen
          </button>
          {role !== 'kitchen' && (
            <Link href="/orders" className={s.kdsBtn}>
              <Icon name="close" size={18} /> Exit
            </Link>
          )}
        </div>
      </header>

      {tickets.length === 0 ? (
        <div className={s.kdsEmpty}>
          <div>
            <Icon name="chef" size={56} style={{ margin: '0 auto 16px' }} />
            All caught up.
            <br />
            New tickets appear here with a sound.
          </div>
        </div>
      ) : (
        <div className={s.kdsGrid}>
          {tickets.map((o) => {
            const age = now - new Date(o.acceptedAt ?? o.createdAt).getTime();
            const min = age / 60000;
            return (
              <article key={o.id} className={cx(s.ticket, o.status === 'preparing' && s.ticketPreparing, min >= 10 && s.ticketWarn, min >= 20 && s.ticketLate)}>
                <div className={s.ticketHead}>
                  <div>
                    <div className={s.ticketTable}>{o.table.label}</div>
                    <div className={s.ticketNo}>
                      #{o.number} · {o.status === 'preparing' ? 'Preparing' : 'New'}
                    </div>
                  </div>
                  <div className={s.ticketTimer} style={{ color: min >= 20 ? '#ff6b6b' : min >= 10 ? '#ffc35c' : '#e8eaee' }}>
                    {mmss(age)}
                  </div>
                </div>
                <ul className={s.ticketItems}>
                  {o.items.map((i) => (
                    <li key={i.id}>
                      <b>{i.qty}×</b>
                      <span>
                        {i.name}
                        {(i.variant || i.addons.length > 0) && <small>{[i.variant?.name, ...i.addons.map((a) => a.name)].filter(Boolean).join(' · ')}</small>}
                        {i.note && <small style={{ color: '#ffd27a' }}>“{i.note}”</small>}
                      </span>
                    </li>
                  ))}
                </ul>
                {o.note && <p className={s.ticketNote}>{o.note}</p>}
                <button type="button" className={cx(s.ticketAction, o.status === 'preparing' && s.ticketActionReady)} disabled={busy === o.id} onClick={() => void advance(o)}>
                  {busy === o.id ? 'Saving…' : o.status === 'accepted' ? 'START PREPARING' : 'MARK READY'}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {!chime.enabled && (
        <div className={s.soundGate}>
          <button type="button" className={s.kdsBtn} style={{ minHeight: 72, fontSize: '1.25rem', padding: '0 32px' }} onClick={chime.enable}>
            <Icon name="volume" size={24} /> Tap to start the kitchen screen
          </button>
        </div>
      )}
    </div>
  );
}
