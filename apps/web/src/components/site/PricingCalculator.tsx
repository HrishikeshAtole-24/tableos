'use client';

import { useId, useState } from 'react';
import { formatPaise } from '@tableos/schemas/client';
import { Icon } from '@tableos/ui';
import { CONSOLE_URL } from './SiteChrome';
import s from './site.module.css';

const FEE = 200;
const CAP = 99_900;
const DAYS = 30;

export function monthlyCost(ordersPerDay: number): { orders: number; feesPaise: number; capped: boolean; capOrder: number } {
  const orders = ordersPerDay * DAYS;
  const raw = orders * FEE;
  return { orders, feesPaise: Math.min(raw, CAP), capped: raw >= CAP, capOrder: Math.ceil(CAP / FEE) };
}

/** Slider for orders per day → monthly cost and the cap (spec §2.6). */
export function PricingCalculator() {
  const id = useId();
  const [perDay, setPerDay] = useState(12);
  const c = monthlyCost(perDay);
  const pct = (perDay / 60) * 100;
  const perOrder = c.orders ? c.feesPaise / c.orders : 0;

  return (
    <div className={s.calc}>
      <div className={s.calcLeft}>
        <label htmlFor={id} className={s.calcLabel}>
          Accepted QR orders per day
          <strong>{perDay}</strong>
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={60}
          value={perDay}
          onChange={(e) => setPerDay(Number(e.target.value))}
          className={s.range}
          style={{ ['--fill' as string]: `${pct}%` }}
          aria-valuetext={`${perDay} orders a day`}
        />
        <div className={s.rangeScale}>
          <span>0</span>
          <span>20</span>
          <span>40</span>
          <span>60</span>
        </div>
        <ul className={s.calcFacts}>
          <li>
            <Icon name="check" size={16} strokeWidth={3} /> Digital menu, QR codes and AI import are always free
          </li>
          <li>
            <Icon name="check" size={16} strokeWidth={3} /> ₹2 per accepted order, from a prepaid wallet
          </li>
          <li>
            <Icon name="check" size={16} strokeWidth={3} /> Fees stop at ₹999 a month (order {c.capOrder} onwards is free)
          </li>
        </ul>
      </div>
      <div className={s.calcRight}>
        <span className={s.calcSmall}>About {c.orders.toLocaleString('en-IN')} orders a month</span>
        <span className={s.calcPrice}>
          {formatPaise(c.feesPaise)}
          <small>/month</small>
        </span>
        <div className={s.capMeter} role="img" aria-label={`${Math.round((c.feesPaise / CAP) * 100)}% of the monthly cap`}>
          <span style={{ width: `${(c.feesPaise / CAP) * 100}%` }} />
        </div>
        <span className={s.calcSmall}>
          {c.capped ? 'You hit the ₹999 cap. Every extra order this month is free.' : `${formatPaise(CAP - c.feesPaise)} below the monthly cap`}
        </span>
        {c.orders > 0 && <span className={s.calcPer}>Effective cost: {formatPaise(Math.round(perOrder))} per order + GST</span>}
        <a href={`${CONSOLE_URL}/signup`} className={s.ctaPrimary}>
          Start free <Icon name="arrowRight" size={18} />
        </a>
        <span className={s.calcSmall}>Prefer a fixed bill? The flat plan is ₹999 a month for unlimited orders.</span>
      </div>
    </div>
  );
}
