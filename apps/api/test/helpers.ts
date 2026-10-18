import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import supertest from 'supertest';
import { createPrismaClient, type Db } from '@tableos/db';
import { createApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import type { Deps } from '../src/context';
import { MemoryQueue } from '../src/jobs/queue';
import { createLogger } from '../src/lib/logger';
import { createSupabaseVerifier } from '../src/modules/auth/tokens';
import { FakeAiClient } from '../src/modules/imports/ai-client';
import { LogMailer } from '../src/modules/notifications/mailer';
import { MockProvider } from '../src/modules/payments/providers/mock';
import { ProviderRegistry } from '../src/modules/payments/registry';
import { MemoryStorage } from '../src/modules/storage/storage';
import { RecordingRealtime } from '../src/realtime/realtime';
import { createServices } from '../src/services';

export interface TestCtx {
  deps: Deps;
  db: Db;
  services: ReturnType<typeof createServices>;
  api: ReturnType<typeof supertest>;
  realtime: RecordingRealtime;
  jobs: MemoryQueue;
  mailer: LogMailer;
  ai: FakeAiClient;
  mock: MockProvider;
  clock: { now: Date };
}

let shared: Db | null = null;

export function buildTestApp(start = new Date('2026-10-14T08:00:00Z')): TestCtx {
  const env = loadEnv();
  shared ??= createPrismaClient(env.DATABASE_URL);
  const db = shared;
  const clock = { now: start };
  const realtime = new RecordingRealtime();
  const jobs = new MemoryQueue();
  const mailer = new LogMailer();
  const ai = new FakeAiClient();
  const mock = new MockProvider('http://api.test');
  const providers = new ProviderRegistry().register(mock);
  const deps: Deps = {
    env,
    db,
    log: createLogger('silent', false),
    realtime,
    jobs,
    providers,
    storage: new MemoryStorage(),
    mailer,
    ai,
    clock: () => clock.now,
  };
  const services = createServices(deps);
  const app = createApp(deps, services, createSupabaseVerifier(env.SUPABASE_URL, env.SUPABASE_JWT_SECRET));
  return { deps, db, services, api: supertest(app), realtime, jobs, mailer, ai, mock, clock };
}

/** A Supabase-style access token (HS256, aud=authenticated). */
export async function tokenFor(user: { id: string; email?: string; phone?: string; aal?: string }): Promise<string> {
  return new SignJWT({ email: user.email, phone: user.phone, role: 'authenticated', aal: user.aal ?? 'aal1' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!));
}

export interface Actor {
  id: string;
  token: string;
  email: string;
}

export async function newUser(label = 'user'): Promise<Actor> {
  const id = randomUUID();
  const email = `${label}-${id.slice(0, 8)}@test.tableos.in`;
  return { id, email, token: await tokenFor({ id, email }) };
}

/** Owner + restaurant with one category, two dishes (one with variants/add-ons) and one table. */
export async function setupRestaurant(t: TestCtx, opts: { requireFirstOrderAcceptance?: boolean } = {}) {
  const owner = await newUser('owner');
  const h = (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${owner.token}`, ...extra });
  const created = await t.api.post('/v1/restaurants').set(h()).send({ name: `Test Cafe ${owner.id.slice(0, 4)}`, city: 'Pune' }).expect(201);
  const rid = created.body.id as string;
  const H = (extra: Record<string, string> = {}) => h({ 'X-Restaurant-Id': rid, ...extra });
  if (opts.requireFirstOrderAcceptance === false) {
    await t.api.patch(`/v1/restaurants/${rid}`).set(H()).send({ requireFirstOrderAcceptance: false }).expect(200);
  }
  const cat = await t.api.post('/v1/menu/categories').set(H()).send({ name: 'Mains' }).expect(201);
  const dal = await t.api.post('/v1/menu/items').set(H()).send({ categoryId: cat.body.id, name: 'Dal Tadka', basePricePaise: 19900, taxRateBp: 500 }).expect(201);
  const biryani = await t.api
    .post('/v1/menu/items')
    .set(H())
    .send({
      categoryId: cat.body.id,
      name: 'Chicken Biryani',
      diet: 'nonveg',
      basePricePaise: 32900,
      variants: [{ name: 'Regular', pricePaise: 32900 }, { name: 'Family', pricePaise: 79900 }],
      addonGroups: [{ name: 'Sides', maxSelect: 2, addons: [{ name: 'Raita', pricePaise: 4000 }, { name: 'Egg', pricePaise: 2500 }] }],
    })
    .expect(201);
  const tables = await t.api.post('/v1/tables').set(H()).send({ label: 'T1' }).expect(201);
  const table = tables.body[0] as { id: string; qrUrl: string };
  const qr = new URL(table.qrUrl).searchParams.get('t')!;
  return { owner, rid, H, categoryId: cat.body.id as string, dal: dal.body, biryani: biryani.body, table, qr };
}

export async function addMember(t: TestCtx, rid: string, role: 'manager' | 'waiter' | 'kitchen'): Promise<Actor & { H: (e?: Record<string, string>) => Record<string, string> }> {
  const u = await newUser(role);
  await t.db.user.create({ data: { id: u.id, email: u.email, emailVerifiedAt: new Date() } });
  await t.db.membership.create({ data: { userId: u.id, restaurantId: rid, role } });
  return { ...u, H: (e = {}) => ({ Authorization: `Bearer ${u.token}`, 'X-Restaurant-Id': rid, ...e }) };
}

export async function startSession(t: TestCtx, qr: string) {
  const res = await t.api.post('/v1/public/sessions').send({ qr }).expect(201);
  return { token: res.body.token as string, sessionId: res.body.sessionId as string, body: res.body };
}

export const idem = () => ({ 'Idempotency-Key': `test-${randomUUID()}` });
