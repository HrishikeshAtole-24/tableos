'use client';

import { useMemo, useState } from 'react';
import { computeBill, formatPaise } from '@tableos/schemas';
import { AddButton, Banner, Button, DietMark, Icon, IconButton } from '@tableos/ui';
import type { CartAction, CartState } from '@/lib/cart';
import type { Strings } from '@/lib/i18n';
import s from './diner.module.css';

interface Props {
  cart: CartState;
  dispatch: (a: CartAction) => void;
  strings: Strings;
  restaurantName: string;
  tableLabel: string;
  serviceChargeBp: number;
  canOrder: boolean;
  blockedReason: string | null;
  unavailableNames: string[];
  placing: boolean;
  onBack: () => void;
  onPlace: (details: { customerName: string | null; customerPhone: string | null }) => void;
  onRemoveUnavailable: () => void;
}

export function CartView({ cart, dispatch, strings, restaurantName, tableLabel, serviceChargeBp, canOrder, blockedReason, unavailableNames, placing, onBack, onPlace, onRemoveUnavailable }: Props) {
  const [showNote, setShowNote] = useState(Boolean(cart.note));
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const bill = useMemo(() => computeBill({ lines: cart.lines.map((l) => ({ unitPricePaise: l.unitPricePaise, qty: l.qty, taxRateBp: l.taxRateBp })), serviceChargeBp, discountPaise: 0 }), [cart.lines, serviceChargeBp]);
  const phoneValid = !phone || /^(\+91)?[6-9]\d{9}$/.test(phone.replace(/\s/g, ''));

  return (
    <div className={s.view}>
      <header className={s.viewHeader}>
        <IconButton icon="arrowLeft" label="Back to menu" onClick={onBack} />
        <div>
          <h1 className={s.viewTitle}>{restaurantName}</h1>
          <p className={s.viewSub}>
            {strings.table} {tableLabel}
          </p>
        </div>
      </header>

      <div className={s.viewBody}>
        {unavailableNames.length > 0 && (
          <Banner
            tone="danger"
            title={strings.soldOutAfterAdd}
            action={
              <Button size="sm" variant="danger" onClick={onRemoveUnavailable}>
                {strings.remove}
              </Button>
            }
          >
            {unavailableNames.join(', ')}
          </Banner>
        )}

        <section className={s.cartCard} aria-label={strings.yourCart}>
          <ul className={s.cartLines}>
            {cart.lines.map((l) => (
              <li key={l.key} className={s.cartLine}>
                <DietMark diet={l.diet} size={14} />
                <div className={s.cartLineText}>
                  <span className={s.cartLineName}>{l.name}</span>
                  {(l.variantName || l.addonNames.length > 0) && <span className={s.cartLineMeta}>{[l.variantName, ...l.addonNames].filter(Boolean).join(', ')}</span>}
                  {l.note && <span className={s.cartLineNote}>“{l.note}”</span>}
                </div>
                <div className={s.cartLineRight}>
                  <AddButton size="sm" qty={l.qty} onAdd={() => dispatch({ type: 'inc', key: l.key })} onIncrement={() => dispatch({ type: 'inc', key: l.key })} onDecrement={() => dispatch({ type: 'dec', key: l.key })} label={l.name} />
                  <span className={s.cartLinePrice}>{formatPaise(l.unitPricePaise * l.qty)}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className={s.cartActions}>
            <button type="button" className={s.cartActionBtn} onClick={onBack}>
              <Icon name="plus" size={16} /> {strings.addMore}
            </button>
            <button type="button" className={s.cartActionBtn} onClick={() => setShowNote((v) => !v)}>
              <Icon name="edit" size={16} /> {strings.cookingNote}
            </button>
          </div>
          {showNote && (
            <textarea
              className={s.noteInput}
              maxLength={200}
              rows={2}
              placeholder={strings.notePlaceholder}
              value={cart.note}
              onChange={(e) => dispatch({ type: 'note', note: e.target.value })}
              aria-label={strings.cookingNote}
            />
          )}
        </section>

        <section className={s.cartCard}>
          <h2 className={s.cardHeading}>{strings.billDetails}</h2>
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
                <dt>
                  {strings.serviceCharge} ({serviceChargeBp / 100}%)
                </dt>
                <dd>{formatPaise(bill.serviceChargePaise)}</dd>
              </div>
            )}
            {bill.roundOffPaise !== 0 && (
              <div className={s.billMuted}>
                <dt>{strings.roundOff}</dt>
                <dd>{formatPaise(bill.roundOffPaise)}</dd>
              </div>
            )}
            <div className={s.billTotal}>
              <dt>{strings.toPay}</dt>
              <dd>{formatPaise(bill.totalPaise)}</dd>
            </div>
          </dl>
        </section>

        <section className={s.cartCard}>
          <div className={s.detailsGrid}>
            <label className={s.miniField}>
              <span>{strings.nameOptional}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="given-name" />
            </label>
            <label className={s.miniField}>
              <span>{strings.phoneOptional}</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={14} autoComplete="tel" aria-invalid={!phoneValid || undefined} />
            </label>
          </div>
        </section>

        {blockedReason && <Banner tone="warning" title={strings.pausedTitle}>{blockedReason}</Banner>}
      </div>

      <footer className={s.viewFooter}>
        <div className={s.payRow}>
          <div>
            <span className={s.payTotal}>{formatPaise(bill.totalPaise)}</span>
            <span className={s.payHint}>{strings.payAtCounter}</span>
          </div>
          <Button
            variant="success"
            size="lg"
            loading={placing}
            disabled={!canOrder || cart.lines.length === 0 || unavailableNames.length > 0 || !phoneValid}
            onClick={() => onPlace({ customerName: name.trim() || null, customerPhone: phone.trim() || null })}
            iconRight="arrowRight"
          >
            {strings.placeOrder}
          </Button>
        </div>
      </footer>
    </div>
  );
}
