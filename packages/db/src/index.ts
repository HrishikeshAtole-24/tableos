import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

export * from './generated/client.js';
export type { Prisma } from './generated/client.js';

export type Db = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export function createPrismaClient(connectionString: string, options: { log?: boolean } = {}): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: options.log ? ['warn', 'error'] : ['error'],
  });
}
