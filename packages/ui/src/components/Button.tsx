import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';
import { cx } from '../cx';
import { Icon, type IconName } from '../icons';
import s from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'success' | 'danger' | 'dark' | 'link';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  loading?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, loading, icon, iconRight, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const iconSize = size === 'sm' ? 16 : 20;
  return (
    <button
      ref={ref}
      type={type}
      className={cx(s.button, s[variant], size !== 'md' && s[size], block && s.block, loading && s.loading, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <span className={s.content}>
        {icon && <Icon name={icon} size={iconSize} />}
        {children}
        {iconRight && <Icon name={iconRight} size={iconSize} />}
      </span>
      {loading && <span className={s.spinner} aria-hidden />}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  filled?: boolean;
  small?: boolean;
  iconSize?: number;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, filled, small, iconSize, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} aria-label={label} title={label} className={cx(s.iconButton, filled && s.filled, small && s.small, className)} {...rest}>
      <Icon name={icon} size={iconSize ?? (small ? 18 : 22)} />
    </button>
  );
});
