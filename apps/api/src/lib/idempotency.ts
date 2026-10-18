import { createHash } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { Db } from '@tableos/db';
import { AppError, badRequest, conflict, unprocessable } from './errors';

const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Idempotency-Key handling (spec §3.4) for order creation, recharge and payment creation.
 * First request: reserve the key, run, store status + body. Replay with the same body:
 * return the stored response. Same key, different body: 422. Concurrent duplicate: 409.
 */
export function idempotent(db: Db, scopeOf: (req: Request) => string): RequestHandler {
  return async (req, res, next) => {
    const key = req.header('idempotency-key');
    if (!key || key.length < 8 || key.length > 100) throw badRequest('Idempotency-Key header is required (8–100 characters)');
    const scope = scopeOf(req);
    const requestHash = createHash('sha256').update(JSON.stringify(req.body ?? null)).digest('hex');

    const existing = await db.idempotencyKey.findUnique({ where: { scope_key: { scope, key } } });
    if (existing && existing.expiresAt > new Date()) {
      if (existing.requestHash !== requestHash) throw unprocessable('idempotency_mismatch', 'This Idempotency-Key was used with a different request');
      if (existing.status === null) throw conflict('request_in_progress', 'The same request is still being processed');
      res.status(existing.status).json(existing.response);
      return;
    }
    if (existing) await db.idempotencyKey.delete({ where: { id: existing.id } });

    try {
      await db.idempotencyKey.create({ data: { scope, key, requestHash, expiresAt: new Date(Date.now() + TTL_MS) } });
    } catch {
      throw conflict('request_in_progress', 'The same request is still being processed');
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      const status = res.statusCode;
      // Store successful and client-error outcomes; release the key on server errors so a retry can run.
      const store = status < 500
        ? db.idempotencyKey.update({ where: { scope_key: { scope, key } }, data: { status, response: body as object } })
        : db.idempotencyKey.delete({ where: { scope_key: { scope, key } } });
      store.catch(() => undefined);
      return originalJson(body);
    };
    res.on('close', () => {
      if (!res.writableFinished) db.idempotencyKey.deleteMany({ where: { scope, key, status: null } }).catch(() => undefined);
    });
    try {
      next();
    } catch (err) {
      if (!(err instanceof AppError)) await db.idempotencyKey.deleteMany({ where: { scope, key } }).catch(() => undefined);
      throw err;
    }
  };
}
