'use client';

import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { cx } from '../cx';
import { IconButton } from './Button';
import s from './Sheet.module.css';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** bottom: mobile bottom sheet (centered card on wide screens); center: dialog; right: side panel. */
  placement?: 'bottom' | 'center' | 'right';
  title?: ReactNode;
  footer?: ReactNode;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  hideClose?: boolean;
  className?: string;
  bodyClassName?: string;
}

/**
 * Modal surface built on the native <dialog> element: focus trap, Escape to close and
 * top-layer stacking come from the platform. Bottom sheets close on a downward swipe.
 */
export function Sheet({ open, onClose, children, placement = 'bottom', title, footer, label, size = 'md', hideClose, className, bodyClassName }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = 'hidden';
    } else if (!open && d.open) {
      d.close();
    }
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    d.addEventListener('cancel', onCancel);
    return () => d.removeEventListener('cancel', onCancel);
  }, [onClose]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (placement !== 'bottom') return;
      drag.current = { y: e.clientY, dy: 0 };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [placement],
  );
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current || !panel.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    panel.current.style.transform = `translateY(${drag.current.dy}px)`;
  }, []);
  const onPointerUp = useCallback(() => {
    if (!drag.current || !panel.current) return;
    const { dy } = drag.current;
    panel.current.style.transform = '';
    drag.current = null;
    if (dy > 90) onClose();
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={cx(s.dialog, s[placement], s[size], className)}
      aria-label={label ?? (typeof title === 'string' ? title : undefined)}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div ref={panel} className={s.panel}>
          {placement === 'bottom' && (
            <div className={s.grabber} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} aria-hidden>
              <span />
            </div>
          )}
          {(title || !hideClose) && (
            <header className={cx(s.header, !title && s.headerBare)}>
              {title && <h2 className={s.title}>{title}</h2>}
              {!hideClose && <IconButton icon="close" label="Close" onClick={onClose} small className={s.close} />}
            </header>
          )}
          <div className={cx(s.body, bodyClassName)}>{children}</div>
          {footer && <footer className={s.footer}>{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
