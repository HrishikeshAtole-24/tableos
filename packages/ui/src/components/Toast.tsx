'use client';

import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { cx } from '../cx';
import { Icon, type IconName } from '../icons';
import s from './Toast.module.css';

type Tone = 'neutral' | 'success' | 'error' | 'warning';
interface ToastItem {
  id: number;
  message: ReactNode;
  tone: Tone;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: ReactNode, opts?: { tone?: Tone; durationMs?: number; action?: ToastItem['action'] }) => void;
  success: (message: ReactNode) => void;
  error: (message: ReactNode) => void;
}

const Ctx = createContext<ToastApi | null>(null);
const ICONS: Record<Tone, IconName> = { neutral: 'info', success: 'check', error: 'alert', warning: 'alert' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback<ToastApi['show']>(
    (message, opts = {}) => {
      const id = ++seq.current;
      setItems((list) => [...list.slice(-2), { id, message, tone: opts.tone ?? 'neutral', action: opts.action }]);
      window.setTimeout(() => dismiss(id), opts.durationMs ?? 3200);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({ show, success: (m) => show(m, { tone: 'success' }), error: (m) => show(m, { tone: 'error', durationMs: 4500 }) }),
    [show],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className={s.region} role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx(s.toast, s[t.tone])}>
            <Icon name={ICONS[t.tone]} size={18} strokeWidth={2.4} />
            <span className={s.message}>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className={s.action}
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
