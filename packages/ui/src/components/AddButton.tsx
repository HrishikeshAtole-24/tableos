import { cx } from '../cx';
import { Icon } from '../icons';
import s from './AddButton.module.css';

export interface AddButtonProps {
  qty: number;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: boolean;
  disabledLabel?: string;
  /** Show the small "+" corner that signals customisation, as on food apps. */
  customisable?: boolean;
  size?: 'md' | 'sm';
  label?: string;
}

/** Swiggy-style ADD button that morphs into a − qty + stepper. */
export function AddButton({ qty, onAdd, onIncrement, onDecrement, disabled, disabledLabel = 'Sold out', customisable, size = 'md', label }: AddButtonProps) {
  if (disabled) {
    return (
      <span className={cx(s.root, s.disabled, size === 'sm' && s.sm)} aria-disabled>
        {disabledLabel}
      </span>
    );
  }
  if (qty <= 0) {
    return (
      <button type="button" className={cx(s.root, s.add, size === 'sm' && s.sm)} onClick={onAdd} aria-label={label ? `Add ${label}` : 'Add'}>
        ADD
        {customisable && <span className={s.plus} aria-hidden>+</span>}
      </button>
    );
  }
  return (
    <div className={cx(s.root, s.stepper, size === 'sm' && s.sm)} role="group" aria-label={label ? `${label} quantity` : 'Quantity'}>
      <button type="button" className={s.step} onClick={onDecrement} aria-label="Remove one">
        <Icon name="minus" size={size === 'sm' ? 16 : 18} strokeWidth={3} />
      </button>
      <span className={s.qty} aria-live="polite">
        {qty}
      </span>
      <button type="button" className={s.step} onClick={onIncrement} aria-label="Add one">
        <Icon name="plus" size={size === 'sm' ? 16 : 18} strokeWidth={3} />
      </button>
    </div>
  );
}
