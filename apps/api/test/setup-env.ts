const base = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: base.replace(/\/[^/]+$/, '/tableos_test'),
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  SUPABASE_JWT_SECRET: 'test-supabase-jwt-secret-at-least-32-chars',
  QR_SIGNING_SECRET: 'test-qr-signing-secret-0123456789abcdef',
  SESSION_JWT_SECRET: 'test-session-jwt-secret-0123456789abcdef',
  CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  AI_SERVICE_TOKEN: 'test-ai-token-0123456789',
  PLATFORM_PG_PROVIDER: 'mock',
  PLATFORM_PG_WEBHOOK_SECRET: 'test-webhook-secret',
  LOG_LEVEL: 'silent',
  JOBS_ENABLED: 'false',
});
