import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(4000),
  API_PUBLIC_URL: z.url().default('http://localhost:4000'),
  WEB_URL: z.url().default('http://localhost:3000'),
  CONSOLE_URL: z.url().default('http://localhost:3001'),
  NEXT_PUBLIC_MENU_URL: z.url().default('http://localhost:3000'),
  CORS_EXTRA_ORIGINS: z.string().default(''),
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(16),
  QR_SIGNING_SECRET: z.string().min(32),
  SESSION_JWT_SECRET: z.string().min(32),
  CREDENTIALS_ENCRYPTION_KEY: z.string().min(40),
  AI_SERVICE_URL: z.url().default('http://127.0.0.1:8000'),
  AI_SERVICE_TOKEN: z.string().min(16),
  PLATFORM_PG_PROVIDER: z.enum(['razorpay', 'stripe', 'mock']).default('mock'),
  PLATFORM_PG_KEY_ID: z.string().default(''),
  PLATFORM_PG_KEY_SECRET: z.string().default(''),
  PLATFORM_PG_WEBHOOK_SECRET: z.string().default(''),
  EMAIL_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('TableOS <no-reply@tableos.in>'),
  SENTRY_DSN: z.string().default(''),
  REVALIDATE_SECRET: z.string().default(''),
  STORAGE_BUCKET: z.string().default('media'),
  JOBS_ENABLED: bool.default(true),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'silent']).default('info'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
