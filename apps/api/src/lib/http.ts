import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import { validationError } from './errors';

/** Parse with a Zod schema, turning issues into a 400 validation_error with a field map. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    fields[key] ??= issue.message;
  }
  throw validationError({ fields });
}

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

/**
 * Wrap a controller: whatever it returns is sent as JSON (status 200, or 201 for POST
 * when `created` is set). Express 5 forwards rejected promises to the error handler.
 */
export function json(handler: Handler, opts: { created?: boolean } = {}): RequestHandler {
  return async (req, res, next) => {
    const result = await handler(req, res, next);
    if (res.headersSent) return;
    if (result === undefined) {
      res.status(204).end();
      return;
    }
    res.status(opts.created ? 201 : 200).json(result);
  };
}

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
