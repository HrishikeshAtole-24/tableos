import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type ErrorRequestHandler, type Express } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { ZodError } from 'zod';
import type { Deps } from './context';
import { AppError } from './lib/errors';
import type { SupabaseVerifier } from './modules/auth/tokens';
import { adminRoutes } from './routes/admin.routes';
import { dashboardRoutes } from './routes/dashboard.routes';
import { paymentRoutes } from './routes/payments.routes';
import { publicRoutes } from './routes/public.routes';
import type { Services } from './services';

export function allowedOrigins(deps: Deps): string[] {
  return [deps.env.WEB_URL, deps.env.CONSOLE_URL, deps.env.NEXT_PUBLIC_MENU_URL, ...deps.env.CORS_EXTRA_ORIGINS.split(',')]
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export function createApp(deps: Deps, services: Services, verifier: SupabaseVerifier): Express {
  const app = express();
  const isTest = deps.env.NODE_ENV === 'test';
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    const requestId = (req.header('x-request-id') ?? '').slice(0, 64) || randomUUID();
    res.setHeader('x-request-id', requestId);
    req.ctx = { requestId, log: deps.log.child({ requestId }), ip: req.ip ?? 'unknown' };
    next();
  });
  if (!isTest) {
    app.use(
      pinoHttp({
        logger: deps.log,
        genReqId: (req) => (req as express.Request).ctx.requestId,
        customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
        autoLogging: { ignore: (req) => req.url === '/health' },
      }),
    );
  }

  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: true, directives: { 'default-src': ["'none'"], 'frame-ancestors': ["'none'"] } },
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin: allowedOrigins(deps),
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Restaurant-Id', 'X-Session-Token', 'Idempotency-Key', 'X-Request-Id'],
      maxAge: 600,
    }),
  );

  const limiter = (windowMs: number, limit: number, key?: (req: express.Request) => string) =>
    rateLimit({
      windowMs,
      limit: isTest ? 10_000 : limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      ...(key ? { keyGenerator: key } : {}),
      handler: (_req, res) => res.status(429).json({ code: 'rate_limited', message: 'Too many requests. Please slow down.' }),
    });

  app.get('/health', async (_req, res) => {
    await deps.db.$queryRaw`SELECT 1`;
    res.json({ ok: true, time: deps.clock().toISOString() });
  });

  // Raw-body routes (webhooks) before JSON parsing.
  app.use('/v1', limiter(60_000, 600), paymentRoutes(deps, services));
  app.use(express.json({ limit: '1mb' }));

  // Per IP on public routes, stricter on order creation.
  app.use('/v1/public/orders', limiter(60_000, 30));
  app.use('/v1/public/sessions', limiter(60_000, 30));
  app.use('/v1/public', limiter(60_000, 300), publicRoutes(deps, services));
  app.use('/v1/admin', limiter(60_000, 300), adminRoutes(deps, services, verifier));
  // Per user on dashboard routes (falls back to IP before auth resolves).
  app.use('/v1', limiter(60_000, 600, (req) => req.header('authorization')?.slice(-24) ?? ipKeyGenerator(req.ip ?? '0.0.0.0')), dashboardRoutes(deps, services, verifier));

  app.use((_req, res) => res.status(404).json({ code: 'not_found', message: 'Route not found' }));

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    const log = req.ctx?.log ?? deps.log;
    if (err instanceof AppError) {
      if (err.status === 429 && err.details?.retryAfterSeconds) res.setHeader('Retry-After', String(err.details.retryAfterSeconds));
      res.status(err.status).json(err.toBody());
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({ code: 'validation_error', message: 'Some fields are invalid', details: { fields: Object.fromEntries(err.issues.map((i) => [i.path.join('.') || '_', i.message])) } });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ code: 'bad_json', message: 'Request body is not valid JSON' });
      return;
    }
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ code: 'payload_too_large', message: 'Request body is too large' });
      return;
    }
    log.error({ err }, 'unhandled error');
    res.status(500).json({ code: 'internal_error', message: 'Something went wrong on our side. Please try again.' });
  };
  app.use(onError);

  return app;
}
