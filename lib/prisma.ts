// This module is used by Next.js (webpack-bundled) where the Prisma WASM runtime
// is handled correctly by the bundler. Do NOT import this in node:test tests —
// the Prisma CJS runtime embeds binary data that Node.js native CJS loader rejects.
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
