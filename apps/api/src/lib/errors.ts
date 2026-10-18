import type { ApiErrorBody } from '@tableos/schemas';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  toBody(): ApiErrorBody {
    return this.details ? { code: this.code, message: this.message, details: this.details } : { code: this.code, message: this.message };
  }
}

export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new AppError(400, 'bad_request', message, details);
export const validationError = (details: Record<string, unknown>) =>
  new AppError(400, 'validation_error', 'Some fields are invalid', details);
export const unauthorized = (message = 'Sign in to continue') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have access to this') => new AppError(403, 'forbidden', message);
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(409, code, message, details);
export const unprocessable = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(422, code, message, details);
export const tooMany = (message: string, retryAfterSeconds?: number) =>
  new AppError(429, 'rate_limited', message, retryAfterSeconds ? { retryAfterSeconds } : undefined);
