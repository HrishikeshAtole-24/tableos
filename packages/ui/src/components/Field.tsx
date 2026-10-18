'use client';

import {
  type ClipboardEvent,
  forwardRef,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
  useRef,
} from 'react';
import { cx } from '../cx';
import { Icon, type IconName } from '../icons';
import s from './Field.module.css';

interface FieldShellProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
}

export function FieldShell({ label, hint, error, optional, children, className }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx(s.field, error && s.invalid, className)}>
      {label && (
        <label htmlFor={id} className={s.label}>
          {label}
          {optional && <span className={s.optional}>Optional</span>}
        </label>
      )}
      {children(id, describedBy)}
      {error ? (
        <p id={errId} className={s.error} role="alert">
          <Icon name="alert" size={14} />
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className={s.hint}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  icon?: IconName;
  prefix?: ReactNode;
  suffix?: ReactNode;
  fieldClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, optional, icon, prefix, suffix, className, fieldClassName, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={fieldClassName}>
      {(id, describedBy) => (
        <div className={cx(s.control, className)}>
          {icon && <Icon name={icon} size={18} className={s.leading} />}
          {prefix && <span className={s.affix}>{prefix}</span>}
          <input ref={ref} id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={s.input} {...rest} />
          {suffix && <span className={s.affix}>{suffix}</span>}
        </div>
      )}
    </FieldShell>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, hint, error, optional, className, ...rest }, ref) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional}>
      {(id, describedBy) => (
        <div className={cx(s.control, s.textareaControl, className)}>
          <textarea ref={ref} id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={cx(s.input, s.textarea)} {...rest} />
        </div>
      )}
    </FieldShell>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  options: Array<{ value: string; label: string }>;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, hint, error, options, className, ...rest }, ref) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <div className={cx(s.control, className)}>
          <select ref={ref} id={id} aria-describedby={describedBy} className={cx(s.input, s.select)} {...rest}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={18} className={s.selectIcon} />
        </div>
      )}
    </FieldShell>
  );
});

/** Six boxes, numeric keypad, paste-to-fill, auto-advance; reports the full code once complete. */
export function OtpInput({ value, onChange, length = 6, disabled, error }: { value: string; onChange: (v: string) => void; length?: number; disabled?: boolean; error?: boolean }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');
  const set = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join('').slice(0, length));
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus();
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!text) return;
    e.preventDefault();
    onChange(text);
    refs.current[Math.min(text.length, length - 1)]?.focus();
  };
  return (
    <div className={cx(s.otp, error && s.otpError)} role="group" aria-label="One-time code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={s.otpBox}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          value={d}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={onPaste}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            if (v.length > 2 || (v.length === 2 && !d)) {
              onChange(v.slice(0, length));
              refs.current[Math.min(v.length, length - 1)]?.focus();
              return;
            }
            set(i, v.slice(-1));
            if (v && i < length - 1) refs.current[i + 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}
