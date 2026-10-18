'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OrderDto, ServiceRequestDto } from '@tableos/schemas/client';
import { API_URL, type ApiError, accessToken, api } from './api';

/** Minimal data hook: fetch on mount/when deps change, expose reload and a local setter. */
export function useQuery<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await api<T>(path);
      if (n === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (n === seq.current) setError(e as ApiError);
    } finally {
      if (n === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, setData, error, loading, reload };
}

export interface StaffEvents {
  onOrderCreated?: (o: OrderDto) => void;
  onOrderUpdated?: (o: OrderDto) => void;
  onRequestCreated?: (r: ServiceRequestDto) => void;
  onRequestUpdated?: (r: ServiceRequestDto) => void;
  onSession?: (p: { sessionId: string; status: string; runningTotalPaise: number }) => void;
  onWallet?: (p: { balancePaise: number; orderingPaused: boolean }) => void;
  /** Called after a reconnect and every 10 s while disconnected (polling fallback). */
  onResync?: () => void;
}

/** Joins the restaurant's staff rooms; the server decides which rooms by role. */
export function useStaffSocket(restaurantId: string | null, events: StaffEvents) {
  const [connected, setConnected] = useState(false);
  const h = useRef(events);
  h.current = events;

  useEffect(() => {
    if (!restaurantId) return;
    let socket: import('socket.io-client').Socket | null = null;
    let poll: number | null = null;
    let cancelled = false;
    const startPoll = () => {
      if (poll === null) poll = window.setInterval(() => h.current.onResync?.(), 10_000);
    };
    const stopPoll = () => {
      if (poll !== null) window.clearInterval(poll);
      poll = null;
    };
    void (async () => {
      const [{ io }, token] = await Promise.all([import('socket.io-client'), accessToken()]);
      if (cancelled || !token) return;
      const s = io(API_URL, { path: '/socket.io', auth: { token }, transports: ['websocket', 'polling'], reconnectionDelayMax: 5000 });
      socket = s;
      let dropped = false;
      s.on('connect', () => {
        s.emit('join.restaurant', { restaurantId }, () => undefined);
        setConnected(true);
        stopPoll();
        if (dropped) h.current.onResync?.();
        dropped = false;
      });
      s.on('disconnect', () => {
        dropped = true;
        setConnected(false);
        startPoll();
      });
      s.on('connect_error', () => {
        setConnected(false);
        startPoll();
      });
      s.on('order.created', (o: OrderDto) => h.current.onOrderCreated?.(o));
      s.on('order.updated', (o: OrderDto) => h.current.onOrderUpdated?.(o));
      s.on('request.created', (r: ServiceRequestDto) => h.current.onRequestCreated?.(r));
      s.on('request.updated', (r: ServiceRequestDto) => h.current.onRequestUpdated?.(r));
      s.on('session.updated', (p: { sessionId: string; status: string; runningTotalPaise: number }) => h.current.onSession?.(p));
      s.on('wallet.updated', (p: { balancePaise: number; orderingPaused: boolean }) => h.current.onWallet?.(p));
    })();
    return () => {
      cancelled = true;
      stopPoll();
      socket?.disconnect();
    };
  }, [restaurantId]);

  return connected;
}

/** Short alert chime generated with Web Audio (no asset to load). */
export function useChime() {
  const ctx = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false);
  const enable = useCallback(() => {
    ctx.current ??= new AudioContext();
    void ctx.current.resume();
    setEnabled(true);
  }, []);
  const play = useCallback((loud = false) => {
    const c = ctx.current;
    if (!c || c.state !== 'running') return;
    const notes = loud ? [880, 1175, 880, 1175] : [880, 1320];
    notes.forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      const t = c.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(loud ? 0.9 : 0.4, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 0.18);
    });
  }, []);
  return { enabled, enable, play };
}

/** Re-render every `ms` (for timers). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}
