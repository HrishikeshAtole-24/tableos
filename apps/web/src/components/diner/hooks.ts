'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OrderDto, ServiceRequestDto, SessionDto } from '@tableos/schemas/client';
import { API_URL, ApiError, apiFetch } from '@/lib/api';

export type SessionState =
  | { kind: 'loading' }
  | { kind: 'none' } // view-only: no table in the link
  | { kind: 'invalid'; message: string }
  | { kind: 'closed' }
  | { kind: 'active'; session: SessionDto };

const tokenKey = (slug: string) => `tos-session:${slug}`;

function readStored(slug: string): { token: string; qr: string } | null {
  try {
    const raw = sessionStorage.getItem(tokenKey(slug));
    return raw ? (JSON.parse(raw) as { token: string; qr: string }) : null;
  } catch {
    return null;
  }
}

function store(slug: string, value: { token: string; qr: string } | null) {
  try {
    if (value) sessionStorage.setItem(tokenKey(slug), JSON.stringify(value));
    else sessionStorage.removeItem(tokenKey(slug));
  } catch {
    /* ignore */
  }
}

/** QR token → table session. Reuses a stored session token for the same QR across reloads. */
export function useDinerSession(slug: string, qr: string | null) {
  const [state, setState] = useState<SessionState>(qr ? { kind: 'loading' } : { kind: 'none' });
  const tokenRef = useRef<string | null>(null);

  const start = useCallback(async () => {
    if (!qr) return setState({ kind: 'none' });
    const stored = readStored(slug);
    if (stored && stored.qr === qr) {
      try {
        const current = await apiFetch<SessionDto>('/v1/public/sessions/current', { sessionToken: stored.token });
        tokenRef.current = stored.token;
        return setState({ kind: 'active', session: { ...current, token: stored.token } });
      } catch {
        store(slug, null);
      }
    }
    try {
      const s = await apiFetch<SessionDto>('/v1/public/sessions', { method: 'POST', body: JSON.stringify({ qr }) });
      tokenRef.current = s.token;
      store(slug, { token: s.token, qr });
      setState({ kind: 'active', session: s });
    } catch (err) {
      setState({ kind: 'invalid', message: err instanceof ApiError ? err.message : 'Could not open your table. Check your connection.' });
    }
  }, [qr, slug]);

  useEffect(() => {
    void start();
  }, [start]);

  const refresh = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    try {
      const current = await apiFetch<SessionDto>('/v1/public/sessions/current', { sessionToken: token });
      setState((prev) => (prev.kind === 'active' ? { kind: 'active', session: { ...current, token } } : prev));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        store(slug, null);
        setState({ kind: 'closed' });
      }
    }
  }, [slug]);

  const upsertOrder = useCallback((order: OrderDto) => {
    setState((prev) => {
      if (prev.kind !== 'active') return prev;
      const orders = prev.session.orders.some((o) => o.id === order.id)
        ? prev.session.orders.map((o) => (o.id === order.id ? order : o))
        : [...prev.session.orders, order];
      return { kind: 'active', session: { ...prev.session, orders } };
    });
  }, []);

  const markClosed = useCallback(() => {
    store(slug, null);
    setState({ kind: 'closed' });
  }, [slug]);

  return { state, token: tokenRef, refresh, upsertOrder, markClosed, restart: start };
}

export interface RealtimeHandlers {
  onOrder: (o: OrderDto) => void;
  onAvailability: (p: { itemId: string; available: boolean; kind: 'item' | 'addon' }) => void;
  onSession: (p: { sessionId: string; status: string; runningTotalPaise: number }) => void;
  onRequest: (r: ServiceRequestDto) => void;
  onReconnect: () => void;
}

/**
 * Socket.IO with a 10-second polling fallback (spec §3.7 Realtime). The client library is
 * loaded after first paint to keep the menu's first-load JavaScript small.
 */
export function useRealtime(sessionToken: string | null, handlers: RealtimeHandlers) {
  const [connected, setConnected] = useState(true);
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    if (!sessionToken) return;
    let socket: { disconnect: () => void } | null = null;
    let poll: number | null = null;
    let cancelled = false;
    const startPolling = () => {
      if (poll === null) poll = window.setInterval(() => h.current.onReconnect(), 10_000);
    };
    const stopPolling = () => {
      if (poll !== null) window.clearInterval(poll);
      poll = null;
    };

    // Load the socket client only once the page is idle so it never competes with first paint.
    const idle = (cb: () => void) => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(cb, { timeout: 2500 }) : setTimeout(cb, 1200));
    const load = () => import('socket.io-client');
    void new Promise<Awaited<ReturnType<typeof load>>>((resolve) => idle(() => void load().then(resolve))).then(({ io }) => {
      if (cancelled) return;
      const s = io(API_URL, { path: '/socket.io', auth: { sessionToken }, transports: ['websocket', 'polling'], reconnectionDelayMax: 8000 });
      socket = s;
      let wasDisconnected = false;
      s.on('connect', () => {
        setConnected(true);
        stopPolling();
        if (wasDisconnected) h.current.onReconnect();
        wasDisconnected = false;
      });
      s.on('disconnect', () => {
        wasDisconnected = true;
        setConnected(false);
        startPolling();
      });
      s.on('connect_error', () => {
        setConnected(false);
        startPolling();
      });
      s.on('order.updated', (o: OrderDto) => h.current.onOrder(o));
      s.on('menu.availability', (p: { itemId: string; available: boolean; kind: 'item' | 'addon' }) => h.current.onAvailability(p));
      s.on('session.updated', (p: { sessionId: string; status: string; runningTotalPaise: number }) => h.current.onSession(p));
      s.on('request.updated', (r: ServiceRequestDto) => h.current.onRequest(r));
    });
    return () => {
      cancelled = true;
      stopPolling();
      socket?.disconnect();
    };
  }, [sessionToken]);

  return connected;
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

type EventType = 'menu_view' | 'item_view' | 'add_to_cart' | 'order_placed';

/** Batches diner analytics and flushes every 5 s and when the page is hidden. */
export function useAnalytics(restaurantId: string, sessionId: string | null) {
  const queue = useRef<Array<{ type: EventType; itemId: string | null; at: string }>>([]);
  const ids = useRef({ restaurantId, sessionId });
  ids.current = { restaurantId, sessionId };

  const flush = useCallback(() => {
    if (queue.current.length === 0) return;
    const events = queue.current.splice(0, 50);
    void fetch(`${API_URL}/v1/public/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId: ids.current.restaurantId, sessionId: ids.current.sessionId, events }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(flush, 5_000);
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  return useCallback((type: EventType, itemId: string | null = null) => {
    queue.current.push({ type, itemId, at: new Date().toISOString() });
  }, []);
}
