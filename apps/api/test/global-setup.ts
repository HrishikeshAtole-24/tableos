import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const TEST_DB = 'tableos_test';

/** Fresh database per run, migrated with the real migration files. */
export default async function setup() {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  await client.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid()`);
  await client.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await client.query(`CREATE DATABASE ${TEST_DB}`);
  await client.end();

  const url = ADMIN_URL.replace(/\/[^/]+$/, `/${TEST_DB}`);
  execSync('npx prisma migrate deploy', {
    cwd: fileURLToPath(new URL('../../../packages/db', import.meta.url)),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  process.env.TEST_DATABASE_URL = url;
}
