import type { ReactNode } from 'react';
import { cx } from '../cx';
import { Icon, type IconName } from '../icons';
import s from './Marks.module.css';

export type Diet = 'veg' | 'nonveg' | 'egg';
const DIET_LABEL: Record<Diet, string> = { veg: 'Vegetarian', nonveg: 'Non-vegetarian', egg: 'Contains egg' };

/** FSSAI-style square mark: green dot for veg, red triangle for non-veg, amber dot for egg. */
export function DietMark({ diet, size = 16 }: { diet: Diet; size?: number }) {
  return (
    <span className={cx(s.diet, s[diet])} style={{ width: size, height: size }} role="img" aria-label={DIET_LABEL[diet]} title={DIET_LABEL[diet]}>
      <span className={s.dietInner} />
    </span>
  );
}

export type TagTone = 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'dark';

export function Tag({ tone = 'neutral', icon, children, className }: { tone?: TagTone; icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <span className={cx(s.tag, s[`tag_${tone}`], className)}>
      {icon && <Icon name={icon} size={12} strokeWidth={2.4} />}
      {children}
    </span>
  );
}

/** Small status pill with a dot, used on boards and lists. */
export function Badge({ tone = 'neutral', children, pulse }: { tone?: TagTone; children: ReactNode; pulse?: boolean }) {
  return (
    <span className={cx(s.badge, s[`tag_${tone}`])}>
      <span className={cx(s.dot, pulse && s.pulse)} />
      {children}
    </span>
  );
}

export function SpiceLevel({ level }: { level: number }) {
  if (level <= 0) return null;
  const label = ['', 'Mildly spicy', 'Spicy', 'Very spicy'][Math.min(level, 3)];
  return (
    <span className={s.spice} role="img" aria-label={label} title={label}>
      {Array.from({ length: Math.min(level, 3) }, (_, i) => (
        <Icon key={i} name="flame" size={14} strokeWidth={2.2} />
      ))}
    </span>
  );
}

export function Rating({ value, count }: { value: number; count?: number }) {
  return (
    <span className={s.rating}>
      <Icon name="star" size={14} />
      <span>{value.toFixed(1)}</span>
      {count !== undefined && <span className={s.ratingCount}>({count})</span>}
    </span>
  );
}
