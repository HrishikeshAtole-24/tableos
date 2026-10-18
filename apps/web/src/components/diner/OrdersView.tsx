'use client';

import { type BillDto, type OrderDto, ORDER_STEPS, formatPaise } from '@tableos/schemas/client';
import { Badge, Button, DietMark, EmptyState, Icon, IconButton, Sheet, cx } from '@tableos/ui';
import type { Strings } from '@/lib/i18n';
import s from './diner.module.css';

const TIME = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

function StatusSteps({ order, strings }: { order: OrderDto; strings: Strings }) {
  if (order.status === 'rejected' || order.status === 'cancelled') {
    return (
      <div className={s.rejected}>
        <Icon name="alert" size={18} />
        <div>
          <strong>{strings[`status_${order.status}`]}</strong>
          {order.rejectReason && (
            <p>
              {strings.reason}: {order.rejectReason}
            </p>
          )}
        </div>
      </div>
    );
  }
  const idx = ORDER_STEPS.indexOf(order.status);
  const stamps: Record<string, string | null> = { placed: order.createdAt, accepted: order.acceptedAt, preparing: order.preparingAt, ready: order.readyAt, served: order.servedAt };
  return (
    <ol className={s.steps}>
      {ORDER_STEPS.map((step, i) => {
        const state = i < idx ? 'done' : i === idx ? (step === 'served' ? 'done' : 'current') : 'todo';
        const at = stamps[step];
        return (
          <li key={step} className={cx(s.step, s[`step_${state}`])}>
            <span className={s.stepDot}>{state === 'done' ? <Icon name="check" size={13} strokeWidth={3.2} /> : state === 'current' ? <span /> : null}</span>
            <span className={s.stepLabel}>{strings[`status_${step}`]}</span>
            <span className={s.stepTime}>{at && state !== 'todo' ? TIME.format(new Date(at)) : step === 'accepted' && order.status === 'placed' ? strings.waitingForStaff : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrdersView({ orders, strings, runningTotalPaise, tableLabel, onBack, onOrderMore, onViewBill }: { orders: OrderDto[]; strings: Strings; runningTotalPaise: number; tableLabel: string; onBack: () => void; onOrderMore: () => void; onViewBill: () => void }) {
  const sorted = [...orders].sort((a, b) => b.number - a.number);
  return (
    <div className={s.view}>
      <header className={s.viewHeader}>
        <IconButton icon="arrowLeft" label="Back to menu" onClick={onBack} />
        <div>
          <h1 className={s.viewTitle}>{strings.yourOrders}</h1>
          <p className={s.viewSub}>
            {strings.table} {tableLabel}
          </p>
        </div>
      </header>
      <div className={s.viewBody}>
        {sorted.length === 0 ? (
          <EmptyState icon="bag" title={strings.noOrdersYet} description={strings.noOrdersHint} />
        ) : (
          sorted.map((o) => (
            <section key={o.id} className={s.cartCard} aria-label={strings.orderNo(o.number)}>
              <div className={s.orderHead}>
                <div>
                  <h2 className={s.cardHeading}>{strings.orderNo(o.number)}</h2>
                  <span className={s.viewSub}>{TIME.format(new Date(o.createdAt))}</span>
                </div>
                <Badge tone={o.status === 'served' ? 'success' : o.status === 'rejected' || o.status === 'cancelled' ? 'danger' : o.status === 'placed' ? 'warning' : 'brand'} pulse={['placed', 'accepted', 'preparing'].includes(o.status)}>
                  {strings[`status_${o.status}`]}
                </Badge>
              </div>
              <StatusSteps order={o} strings={strings} />
              <ul className={s.orderItems}>
                {o.items.map((i) => (
                  <li key={i.id}>
                    {i.diet && <DietMark diet={i.diet} size={12} />}
                    <span className={s.orderItemQty}>{i.qty} ×</span>
                    <span className={s.orderItemName}>
                      {i.name}
                      {i.variant && <em> · {i.variant.name}</em>}
                    </span>
                    <span>{formatPaise(i.unitPricePaise * i.qty)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
      <footer className={s.viewFooter}>
        <div className={s.payRow}>
          <div>
            <span className={s.payHint}>{strings.runningBill}</span>
            <span className={s.payTotal}>{formatPaise(runningTotalPaise)}</span>
          </div>
          <div className={s.footerBtns}>
            <Button variant="outline" onClick={onViewBill} icon="receipt">
              {strings.bill}
            </Button>
            <Button onClick={onOrderMore} icon="plus">
              {strings.orderMore}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function BillSheet({ open, onClose, bill, strings, loading }: { open: boolean; onClose: () => void; bill: BillDto | null; strings: Strings; loading: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title={strings.bill} size="md">
      {loading || !bill ? (
        <div className={s.billLoading}>
          <span className={s.sk} style={{ height: 18, width: '60%' }} />
          <span className={s.sk} style={{ height: 18, width: '80%' }} />
          <span className={s.sk} style={{ height: 18, width: '50%' }} />
        </div>
      ) : (
        <div className={s.billSheet}>
          <div className={s.billHead}>
            <strong>{bill.restaurant.name}</strong>
            {bill.restaurant.address && <span>{bill.restaurant.address}</span>}
            {bill.restaurant.gstin && <span>GSTIN {bill.restaurant.gstin}</span>}
            <span>
              {strings.table} {bill.table.label}
            </span>
          </div>
          <ul className={s.billLines}>
            {bill.lines.map((l, i) => (
              <li key={i}>
                <span>
                  {l.qty} × {l.name}
                  {l.variant ? ` (${l.variant})` : ''}
                  {l.addons.length > 0 && <em>{l.addons.join(', ')}</em>}
                </span>
                <span>{formatPaise(l.lineTotalPaise)}</span>
              </li>
            ))}
          </ul>
          <dl className={s.billRows}>
            <div>
              <dt>{strings.itemTotal}</dt>
              <dd>{formatPaise(bill.subtotalPaise)}</dd>
            </div>
            <div>
              <dt>{strings.taxes}</dt>
              <dd>{formatPaise(bill.taxPaise)}</dd>
            </div>
            {bill.serviceChargePaise > 0 && (
              <div>
                <dt>{strings.serviceCharge}</dt>
                <dd>{formatPaise(bill.serviceChargePaise)}</dd>
              </div>
            )}
            {bill.discountPaise > 0 && (
              <div className={s.billDiscount}>
                <dt>{strings.discount}</dt>
                <dd>− {formatPaise(bill.discountPaise)}</dd>
              </div>
            )}
            {bill.roundOffPaise !== 0 && (
              <div className={s.billMuted}>
                <dt>{strings.roundOff}</dt>
                <dd>{formatPaise(bill.roundOffPaise)}</dd>
              </div>
            )}
            <div className={s.billTotal}>
              <dt>{strings.total}</dt>
              <dd>{formatPaise(bill.totalPaise)}</dd>
            </div>
          </dl>
          <p className={s.payNote}>
            <Icon name="info" size={16} /> {bill.status === 'paid' ? strings.paid : strings.payAtCounter}
          </p>
        </div>
      )}
    </Sheet>
  );
}
