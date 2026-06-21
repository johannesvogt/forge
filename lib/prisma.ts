// This module is used by Next.js (webpack-bundled) where the Prisma WASM runtime
// is handled correctly by the bundler. Do NOT import this in node:test tests —
// the Prisma CJS runtime embeds binary data that Node.js native CJS loader rejects.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL']! });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
