// Single source of truth for "which database are we talking to?".
// DATABASE_URL is authoritative: everything else (the schema `provider`, the
// migrations directory, the driver adapter) is derived from it.

export type DatabaseProvider = 'sqlite' | 'postgresql';

/** Migration history is kept per provider — Prisma cannot replay Postgres DDL on SQLite. */
export const MIGRATIONS_DIR: Record<DatabaseProvider, string> = {
  sqlite: 'prisma/migrations-sqlite',
  postgresql: 'prisma/migrations-postgres',
};

/**
 * Resolve the provider from a connection string. Anything that is not a
 * Postgres URL is treated as SQLite (`file:./dev.db`, `:memory:`, a bare path).
 */
export function providerFromUrl(url: string | undefined): DatabaseProvider {
  if (!url) throw new Error('DATABASE_URL is not set');
  return url.startsWith('postgres://') || url.startsWith('postgresql://') ? 'postgresql' : 'sqlite';
}
