'use client';

import type { ApiErrorBody } from '@tableos/schemas';
import { supabase } from './supabase';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const RESTAURANT_KEY = 'tos-restaurant';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
  }
  get code() {
    return this.body.code;
  }
  /** Field-level messages from validation errors. */
  get fields(): Record<string, string> {
    return (this.body.details?.fields as Record<string, string>) ?? {};
  }
}

export function getActiveRestaurant(): string | null {
  try {
    return localStorage.getItem(RESTAURANT_KEY);
  } catch {
    return null;
  }
}

export function setActiveRestaurant(id: string | null) {
  try {
    if (id) localStorage.setItem(RESTAURANT_KEY, id);
    else localStorage.removeItem(RESTAURANT_KEY);
  } catch {
    /* ignore */
  }
}

export async function accessToken(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}

interface Opts extends Omit<RequestInit, 'body'> {
  body?: unknown;
  idempotencyKey?: string;
  noTenant?: boolean;
}

/** Authenticated API call: Bearer token + X-Restaurant-Id of the active restaurant. */
export async function api<T>(path: string, opts: Opts = {}): Promise<T> {
  const { body, idempotencyKey, noTenant, headers, ...rest } = opts;
  const token = await accessToken();
  const rid = noTenant ? null : getActiveRestaurant();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1${path}`, {
      ...rest,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(rid ? { 'X-Restaurant-Id': rid } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { code: 'network', message: 'Cannot reach the server. Check your connection.' });
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({ code: 'bad_response', message: 'Unexpected response' }));
  if (!res.ok) throw new ApiError(res.status, data as ApiErrorBody);
  return data as T;
}

/** Download a file (PDF etc.) with auth headers. */
export async function download(path: string, filename: string) {
  const token = await accessToken();
  const rid = getActiveRestaurant();
  const res = await fetch(`${API_URL}/v1${path}`, { headers: { Authorization: `Bearer ${token}`, 'X-Restaurant-Id': rid ?? '' } });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({ code: 'error', message: 'Download failed' }))) as ApiErrorBody;
    throw new ApiError(res.status, b);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Open an authenticated HTML document (invoice) in a new tab. */
export async function openHtml(path: string) {
  const token = await accessToken();
  const res = await fetch(`${API_URL}/v1${path}`, { headers: { Authorization: `Bearer ${token}`, 'X-Restaurant-Id': getActiveRestaurant() ?? '' } });
  const html = await res.text();
  const w = window.open('', '_blank');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
