import type { ApiErrorBody } from '@tableos/schemas/client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = 'ApiError';
  }
  get code() {
    return this.body.code;
  }
}

export class NetworkError extends Error {
  constructor() {
    super('You seem to be offline. Check your connection and try again.');
    this.name = 'NetworkError';
  }
}

export async function apiFetch<T>(path: string, init: RequestInit & { sessionToken?: string | null; idempotencyKey?: string } = {}): Promise<T> {
  const { sessionToken, idempotencyKey, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
        ...(sessionToken ? { 'X-Session-Token': sessionToken } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        ...headers,
      },
    });
  } catch {
    throw new NetworkError();
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({ code: 'bad_response', message: 'Unexpected response from server' }))) as T | ApiErrorBody;
  if (!res.ok) throw new ApiError(res.status, body as ApiErrorBody);
  return body as T;
}

export function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
