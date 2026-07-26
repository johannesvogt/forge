// This module is used by Next.js (webpack-bundled) where the Prisma WASM runtime
// is handled correctly by the bundler. Do NOT import this in node:test tests —
// the Prisma CJS runtime embeds binary data that Node.js native CJS loader rejects.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { providerFromUrl } from './db/provider.ts';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Pick the driver adapter from the DATABASE_URL scheme so the same code runs on
 * SQLite (default) or Postgres. Note: the generated client's SQL dialect is baked
 * in at `prisma generate` time, so the schema `provider` and DATABASE_URL must
 * agree — `npm run db:use` keeps them in sync.
 */
function createPrismaClient(): PrismaClient {
  const url = process.env['DATABASE_URL']!;
  const adapter =
    providerFromUrl(url) === 'postgresql'
      ? new PrismaPg({ connectionString: url })
      : new PrismaBetterSqlite3({ url });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
