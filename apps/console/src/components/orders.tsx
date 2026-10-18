'use client';

import { useMemo, useState } from 'react';
import { type BillDto, type MenuCategoryDto, type OrderDto, type TableDto, formatPaise } from '@tableos/schemas';
import { Badge, Button, Chip, DietMark, Icon, Input, Segmented, Select, Sheet, Textarea, cx, useToast } from '@tableos/ui';
import { ApiError, api, uid } from '@/lib/api';
import s from './console.module.css';

export const STATUS_TONE = { placed: 'warning', accepted: 'info', preparing: 'brand', ready: 'success', served: 'neutral', rejected: 'danger', cancelled: 'danger' } as const;
export const REJECT_REASONS = ['Item not available', 'Kitchen is closing', 'Duplicate order', 'Guest asked to cancel', 'Too busy right now'];

export function ageMinutes(iso: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

export function ageClass(min: number) {
  return min >= 20 ? s.ageLate : min >= 10 ? s.ageWarn : s.ageOk;
}

export async function setStatus(orderId: string, status: string, reason?: string): Promise<OrderDto> {
  return api<OrderDto>(`/orders/${orderId}/status`, { method: 'PATCH', body: { status, ...(reason ? { reason } : {}) } });
}

export function OrderCard({ order, now, onChange, onReject, canAccept, canCook, canServe }: { order: OrderDto; now: number; onChange: (o: OrderDto) => void; onReject: (o: OrderDto) => void; canAccept: boolean; canCook: boolean; canServe: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const age = ageMinutes(order.acceptedAt ?? order.createdAt, now);
  const run = async (status: string) => {
    setBusy(true);
    try {
      onChange(await setStatus(order.id, status));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not update the order');
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={cx(s.orderCard, order.status === 'placed' && s.orderNew)}>
      <div className={s.orderCardHead}>
        <div>
          <div className={s.row} style={{ gap: 8 }}>
            <span className={s.orderTable}>
              <Icon name="table" size={12} /> {order.table.label}
            </span>
            <span className={s.orderNo}>#{order.number}</span>
          </div>
          {order.customerName && <span className={s.small}>{order.customerName}</span>}
        </div>
        <span className={cx(s.age, ageClass(age))}>
          <Icon name="clock" size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> {age}m
        </span>
      </div>
      <ul className={s.orderItems}>
        {order.items.map((i) => (
          <li key={i.id}>
            <b>{i.qty}×</b>
            <span>
              {i.diet && <DietMark diet={i.diet} size={11} />} {i.name}
              {(i.variant || i.addons.length > 0) && <small>{[i.variant?.name, ...i.addons.map((a) => a.name)].filter(Boolean).join(' · ')}</small>}
              {i.note && <small>“{i.note}”</small>}
            </span>
          </li>
        ))}
      </ul>
      {order.note && <p className={s.note}>{order.note}</p>}
      <div className={s.orderMeta}>
        <span>{order.placedBy === 'staff' ? 'By staff' : 'QR order'}</span>
        <strong>{formatPaise(order.totalPaise)}</strong>
      </div>
      <div className={s.orderActions}>
        {order.status === 'placed' && canAccept && (
          <>
            <Button size="sm" variant="outline" onClick={() => onReject(order)} disabled={busy}>
              Reject
            </Button>
            <Button size="sm" variant="success" loading={busy} onClick={() => void run('accepted')}>
              Accept
            </Button>
          </>
        )}
        {order.status === 'accepted' && canCook && (
          <Button size="sm" loading={busy} onClick={() => void run('preparing')}>
            Start preparing
          </Button>
        )}
        {order.status === 'preparing' && canCook && (
          <Button size="sm" variant="success" loading={busy} onClick={() => void run('ready')}>
            Mark ready
          </Button>
        )}
        {order.status === 'ready' && canServe && (
          <Button size="sm" variant="dark" loading={busy} onClick={() => void run('served')}>
            Mark served
          </Button>
        )}
      </div>
    </article>
  );
}

export function RejectSheet({ order, onClose, onDone, cancel }: { order: OrderDto | null; onClose: () => void; onDone: (o: OrderDto) => void; cancel?: boolean }) {
  const toast = useToast();
  const [reason, setReason] = useState(REJECT_REASONS[0]!);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!order) return;
    setBusy(true);
    try {
      onDone(await setStatus(order.id, cancel ? 'cancelled' : 'rejected', reason === 'Other' ? custom : reason));
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not update');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={Boolean(order)}
      onClose={onClose}
      placement="center"
      size="sm"
      title={order ? `${cancel ? 'Cancel' : 'Reject'} order #${order.number}` : ''}
      footer={
        <Button variant="danger" block loading={busy} disabled={reason === 'Other' && custom.trim().length < 3} onClick={() => void submit()}>
          {cancel ? 'Cancel order' : 'Reject order'}
        </Button>
      }
    >
      <p className={s.muted} style={{ marginBottom: 12 }}>
        The guest sees this reason on their phone.
      </p>
      <div className={s.chips}>
        {[...REJECT_REASONS, 'Other'].map((r) => (
          <Chip key={r} selected={reason === r} onClick={() => setReason(r)}>
            {r}
          </Chip>
        ))}
      </div>
      {reason === 'Other' && (
        <div style={{ marginTop: 12 }}>
          <Textarea label="Reason" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={140} />
        </div>
      )}
    </Sheet>
  );
}

export function BillPanel({ sessionId, onClose, canDiscount }: { sessionId: string | null; onClose: () => void; canDiscount: boolean }) {
  const toast = useToast();
  const [bill, setBill] = useState<BillDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [paidVia, setPaidVia] = useState<'cash' | 'upi' | 'card' | 'online'>('cash');
  const [discount, setDiscount] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);

  if (sessionId && sessionId !== lastId) {
    setLastId(sessionId);
    setBill(null);
    setLoading(true);
    void api<BillDto>(`/sessions/${sessionId}/bill`)
      .then((b) => {
        setBill(b);
        setDiscount(b.discountPaise ? String(b.discountPaise / 100) : '');
      })
      .catch((e) => toast.error(e instanceof ApiError ? e.message : 'Could not load the bill'))
      .finally(() => setLoading(false));
  }

  const applyDiscount = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      setBill(await api<BillDto>(`/sessions/${sessionId}/bill/discount`, { method: 'POST', body: { discountPaise: Math.round(Number(discount || 0) * 100), reason: null } }));
      toast.success('Discount applied');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not apply discount');
    } finally {
      setBusy(false);
    }
  };
  const markPaid = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      setBill(await api<BillDto>(`/sessions/${sessionId}/bill/paid`, { method: 'POST', body: { paidVia } }));
      toast.success('Bill paid and table closed');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not close the bill');
    } finally {
      setBusy(false);
    }
  };

  const printBill = () => {
    if (!bill) return;
    const rows = bill.lines.map((l) => `<tr><td>${l.qty} × ${l.name}${l.variant ? ` (${l.variant})` : ''}</td><td style="text-align:right">${formatPaise(l.lineTotalPaise)}</td></tr>`).join('');
    const w = window.open('', '_blank', 'width=380,height=640');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Bill ${bill.table.label}</title><style>body{font-family:Arial;padding:16px;font-size:13px}table{width:100%;border-collapse:collapse}td{padding:4px 0}h1{font-size:16px;text-align:center;margin:0}.c{text-align:center;color:#555}.t td{border-top:1px dashed #999;font-weight:bold;padding-top:8px}</style></head><body>
<h1>${bill.restaurant.name}</h1><p class="c">${bill.restaurant.address ?? ''}${bill.restaurant.gstin ? `<br>GSTIN ${bill.restaurant.gstin}` : ''}<br>Table ${bill.table.label} · ${new Date().toLocaleString('en-IN')}</p>
<table>${rows}<tr><td>Subtotal</td><td style="text-align:right">${formatPaise(bill.subtotalPaise)}</td></tr><tr><td>GST</td><td style="text-align:right">${formatPaise(bill.taxPaise)}</td></tr>${bill.serviceChargePaise ? `<tr><td>Service charge</td><td style="text-align:right">${formatPaise(bill.serviceChargePaise)}</td></tr>` : ''}${bill.discountPaise ? `<tr><td>Discount</td><td style="text-align:right">−${formatPaise(bill.discountPaise)}</td></tr>` : ''}${bill.roundOffPaise ? `<tr><td>Round off</td><td style="text-align:right">${formatPaise(bill.roundOffPaise)}</td></tr>` : ''}<tr class="t"><td>Total</td><td style="text-align:right">${formatPaise(bill.totalPaise)}</td></tr></table><p class="c">Thank you!</p><script>print()</script></body></html>`);
    w.document.close();
  };

  return (
    <Sheet
      open={Boolean(sessionId)}
      onClose={onClose}
      placement="right"
      size="md"
      title={bill ? `Table ${bill.table.label} bill` : 'Bill'}
      footer={
        bill && bill.status !== 'paid' ? (
          <div className={s.stack} style={{ gap: 12 }}>
            <Segmented
              value={paidVia}
              onChange={setPaidVia}
              items={[
                { value: 'cash', label: 'Cash' },
                { value: 'upi', label: 'UPI' },
                { value: 'card', label: 'Card' },
                { value: 'online', label: 'Online' },
              ]}
            />
            <div className={s.row}>
              <Button variant="outline" icon="printer" onClick={printBill}>
                Print
              </Button>
              <Button variant="success" style={{ flex: 1 }} loading={busy} onClick={() => void markPaid()} disabled={bill.orderCount === 0}>
                Mark paid · {formatPaise(bill.totalPaise)}
              </Button>
            </div>
          </div>
        ) : bill ? (
          <Button variant="outline" icon="printer" block onClick={printBill}>
            Print bill
          </Button>
        ) : undefined
      }
    >
      {loading || !bill ? (
        <p className={s.muted}>Loading bill…</p>
      ) : (
        <div className={s.stack}>
          {bill.status === 'paid' && <Badge tone="success">Paid by {bill.paidVia}</Badge>}
          <ul className={s.orderItems}>
            {bill.lines.length === 0 && <li className={s.muted}>No accepted orders on this table yet.</li>}
            {bill.lines.map((l, i) => (
              <li key={i} style={{ justifyContent: 'space-between' }}>
                <span>
                  <b>{l.qty}×</b> {l.name}
                  {l.variant && <small>{l.variant}</small>}
                </span>
                <span>{formatPaise(l.lineTotalPaise)}</span>
              </li>
            ))}
          </ul>
          <div className={s.divider} style={{ margin: '4px 0' }} />
          <BillRow label="Subtotal" value={bill.subtotalPaise} />
          <BillRow label="GST" value={bill.taxPaise} />
          {bill.serviceChargePaise > 0 && <BillRow label={`Service charge (${bill.serviceChargeBp / 100}%)`} value={bill.serviceChargePaise} />}
          {bill.discountPaise > 0 && <BillRow label="Discount" value={-bill.discountPaise} />}
          {bill.roundOffPaise !== 0 && <BillRow label="Round off" value={bill.roundOffPaise} />}
          <div className={s.between} style={{ font: 'var(--text-h3)' }}>
            <span>Total</span>
            <span>{formatPaise(bill.totalPaise)}</span>
          </div>
          {canDiscount && bill.status !== 'paid' && (
            <div className={s.row} style={{ alignItems: 'flex-end' }}>
              <Input label="Discount (₹)" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ''))} fieldClassName="" style={{ maxWidth: 140 }} />
              <Button variant="outline" loading={busy} onClick={() => void applyDiscount()}>
                Apply
              </Button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function BillRow({ label, value }: { label: string; value: number }) {
  return (
    <div className={s.between}>
      <span className={s.muted}>{label}</span>
      <span>{value < 0 ? `− ${formatPaise(-value)}` : formatPaise(value)}</span>
    </div>
  );
}

/** Waiter places an order for a table: pick table, tap dishes, send. */
export function StaffOrderSheet({ open, onClose, tables, menu, onPlaced, initialTableId }: { open: boolean; onClose: () => void; tables: TableDto[]; menu: MenuCategoryDto[]; onPlaced: (o: OrderDto) => void; initialTableId?: string | null }) {
  const toast = useToast();
  const [tableId, setTableId] = useState<string>(initialTableId ?? tables[0]?.id ?? '');
  const [lines, setLines] = useState<Record<string, { qty: number; variantId: string | null }>>({});
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => menu.flatMap((c) => c.items).filter((i) => i.visible && i.available && i.name.toLowerCase().includes(query.toLowerCase())), [menu, query]);
  const all = useMemo(() => new Map(menu.flatMap((c) => c.items).map((i) => [i.id, i])), [menu]);
  const total = Object.entries(lines).reduce((sum, [id, l]) => {
    const it = all.get(id);
    if (!it) return sum;
    return sum + (it.variants.find((v) => v.id === l.variantId)?.pricePaise ?? it.basePricePaise) * l.qty;
  }, 0);
  const count = Object.values(lines).reduce((a, l) => a + l.qty, 0);

  const place = async () => {
    setBusy(true);
    try {
      const o = await api<OrderDto>('/orders', {
        method: 'POST',
        idempotencyKey: uid(),
        body: { tableId, lines: Object.entries(lines).map(([itemId, l]) => ({ itemId, variantId: l.variantId, addonIds: [], qty: l.qty, note: null })) },
      });
      onPlaced(o);
      setLines({});
      onClose();
      toast.success(`Order #${o.number} sent to the kitchen`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not place the order');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      placement="right"
      size="md"
      title="New order for a table"
      footer={
        <Button variant="success" block size="lg" loading={busy} disabled={!tableId || count === 0} onClick={() => void place()}>
          Send {count > 0 ? `${count} items · ${formatPaise(total)}` : ''} to kitchen
        </Button>
      }
    >
      <div className={s.stack}>
        <Select label="Table" value={tableId} onChange={(e) => setTableId(e.target.value)} options={tables.filter((t) => t.active).map((t) => ({ value: t.id, label: `${t.label}${t.section ? ` · ${t.section}` : ''}` }))} />
        <Input icon="search" placeholder="Search dishes" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div>
          {items.map((it) => {
            const l = lines[it.id];
            const variant = l?.variantId ?? it.variants[0]?.id ?? null;
            return (
              <div key={it.id} className={s.dishRow}>
                <DietMark diet={it.diet} size={14} />
                <div className={s.dishInfo}>
                  <strong>{it.name}</strong>
                  {it.variants.length > 0 ? (
                    <select className={s.cellInput} style={{ maxWidth: 220 }} value={variant ?? ''} onChange={(e) => setLines((cur) => ({ ...cur, [it.id]: { qty: cur[it.id]?.qty ?? 0, variantId: e.target.value } }))}>
                      {it.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} · {formatPaise(v.pricePaise)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={s.small}>{formatPaise(it.basePricePaise)}</span>
                  )}
                </div>
                <div className={s.row} style={{ gap: 6 }}>
                  {l && l.qty > 0 && (
                    <>
                      <Button size="sm" variant="ghost" aria-label="Remove one" onClick={() => setLines((cur) => {
                        const q = (cur[it.id]?.qty ?? 0) - 1;
                        const next = { ...cur };
                        if (q <= 0) delete next[it.id];
                        else next[it.id] = { ...cur[it.id]!, qty: q };
                        return next;
                      })}>
                        <Icon name="minus" size={16} />
                      </Button>
                      <strong style={{ minWidth: 20, textAlign: 'center' }}>{l.qty}</strong>
                    </>
                  )}
                  <Button size="sm" variant="secondary" aria-label={`Add ${it.name}`} onClick={() => setLines((cur) => ({ ...cur, [it.id]: { qty: (cur[it.id]?.qty ?? 0) + 1, variantId: variant } }))}>
                    <Icon name="plus" size={16} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
