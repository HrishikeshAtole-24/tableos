'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';
import { Icon, type IconName } from '../icons';
import s from './Controls.module.css';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  icon?: IconName;
  leading?: ReactNode;
  removable?: boolean;
}

/** Filter chip (pill). Selected chips show a close icon like food-app filters. */
export function Chip({ selected, icon, leading, removable, className, children, type = 'button', ...rest }: ChipProps) {
  return (
    <button type={type} aria-pressed={selected} className={cx(s.chip, selected && s.chipOn, className)} {...rest}>
      {leading}
      {icon && <Icon name={icon} size={16} />}
      <span>{children}</span>
      {selected && removable && <Icon name="close" size={14} strokeWidth={2.4} />}
    </button>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const control = (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={cx(s.switch, checked && s.switchOn)}>
      <span className={s.thumb} />
    </button>
  );
  if (!label) return control;
  return (
    <div className={s.switchRow}>
      <div className={s.switchText}>
        <span className={s.switchLabel}>{label}</span>
        {description && <span className={s.switchDesc}>{description}</span>}
      </div>
      {control}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: ReactNode; count?: number }>; className?: string }) {
  return (
    <div className={cx(s.tabs, className)} role="tablist">
      {items.map((it) => (
        <button key={it.value} type="button" role="tab" aria-selected={value === it.value} className={cx(s.tab, value === it.value && s.tabOn)} onClick={() => onChange(it.value)}>
          {it.label}
          {it.count !== undefined && <span className={s.tabCount}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, items, size = 'md' }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: ReactNode }>; size?: 'sm' | 'md' }) {
  return (
    <div className={cx(s.segmented, size === 'sm' && s.segSm)} role="radiogroup">
      {items.map((it) => (
        <button key={it.value} type="button" role="radio" aria-checked={value === it.value} className={cx(s.seg, value === it.value && s.segOn)} onClick={() => onChange(it.value)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ width, height = 16, radius = 8, className }: { width?: number | string; height?: number | string; radius?: number; className?: string }) {
  return <span className={cx(s.skeleton, className)} style={{ width, height, borderRadius: radius }} aria-hidden />;
}

export function Spinner({ size = 24, label = 'Loading' }: { size?: number; label?: string }) {
  return <span className={s.spinner} style={{ width: size, height: size }} role="status" aria-label={label} />;
}

export function EmptyState({ icon = 'sparkles', title, description, action, compact }: { icon?: IconName; title: ReactNode; description?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx(s.empty, compact && s.emptyCompact)}>
      <span className={s.emptyIcon}>
        <Icon name={icon} size={compact ? 22 : 28} />
      </span>
      <h3 className={s.emptyTitle}>{title}</h3>
      {description && <p className={s.emptyDesc}>{description}</p>}
      {action && <div className={s.emptyAction}>{action}</div>}
    </div>
  );
}

export function Card({ children, className, padded = true, as: As = 'section' }: { children: ReactNode; className?: string; padded?: boolean; as?: 'section' | 'div' | 'article' }) {
  return <As className={cx(s.card, padded && s.cardPadded, className)}>{children}</As>;
}

export function Banner({ tone = 'info', icon, title, children, action }: { tone?: 'info' | 'warning' | 'danger' | 'success' | 'brand'; icon?: IconName; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const defaultIcon: Record<string, IconName> = { info: 'info', warning: 'alert', danger: 'alert', success: 'check', brand: 'sparkles' };
  return (
    <div className={cx(s.banner, s[`banner_${tone}`])} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={icon ?? defaultIcon[tone]!} size={20} />
      <div className={s.bannerText}>
        {title && <strong>{title}</strong>}
        {children && <span>{children}</span>}
      </div>
      {action}
    </div>
  );
}
