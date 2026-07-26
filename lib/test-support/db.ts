// Throwaway SQLite database for node:test suites.
//
// The service tests drive their fakes with raw SQL rather than a real
// PrismaClient — the generated Prisma runtime cannot be loaded under
// `node --experimental-strip-types` (see lib/prisma.ts). This module gives those
// fakes a `pg.Pool`-shaped `query()` over an isolated, in-process SQLite file, so
// the suite needs no running database at all.
//
// The SQL the tests write stays Postgres-flavoured (`$1` placeholders, `NOW()`),
// which `translate()` below rewrites; everything else in it — `RETURNING`,
// `ON CONFLICT ... DO UPDATE`, quoted identifiers — is valid SQLite as-is.

import Database from 'better-sqlite3';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS_DIR = join(PROJECT_ROOT, 'prisma', 'migrations-sqlite');

export interface QueryResult<R = Record<string, unknown>> {
  rows: R[];
}

export interface TestPool {
  query<R = any>(sql: string, params?: unknown[]): Promise<QueryResult<R>>; // eslint-disable-line @typescript-eslint/no-explicit-any
  end(): Promise<void>;
}

/**
 * Timestamps are written in the same shape the better-sqlite3 driver adapter
 * uses (ISO-8601 with a `+00:00` offset), so a test database is readable by the
 * real client and vice versa.
 */
function toSqliteTimestamp(date: Date): string {
  return date.toISOString().replace('Z', '+00:00');
}

function readMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => !entry.endsWith('.toml'))
    .sort()
    .map((entry) => readFileSync(join(MIGRATIONS_DIR, entry, 'migration.sql'), 'utf8'))
    .join('\n');
}

/**
 * Column names declared `DATETIME` anywhere in the schema. SQLite hands these
 * back as strings; the tests (and the services under test) expect `Date`, which
 * is what Prisma itself would return. Names are unique enough across tables that
 * a flat set is sufficient.
 */
function datetimeColumns(ddl: string): Set<string> {
  const names = new Set<string>();
  for (const match of ddl.matchAll(/"([A-Za-z0-9_]+)"\s+DATETIME/g)) {
    names.add(match[1]!);
  }
  return names;
}

/** Rewrite Postgres syntax the tests use into its SQLite equivalent. */
function translate(sql: string, now: string): string {
  return sql
    .replace(/\bnow\(\)/gi, `'${now}'`)
    .replace(/\$(\d+)/g, ':p$1');
}

function bindable(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return toSqliteTimestamp(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

/**
 * Creates an empty SQLite database with the current schema applied and returns a
 * minimal `pg.Pool` stand-in. The backing file is removed by `end()`.
 */
export function createTestPool(): TestPool {
  const dir = mkdtempSync(join(tmpdir(), 'forge-test-'));
  const db = new Database(join(dir, 'test.db'));
  db.pragma('foreign_keys = ON');

  const ddl = readMigrations();
  db.exec(ddl);
  const timestamps = datetimeColumns(ddl);

  function revive<R>(row: Record<string, unknown>): R {
    for (const [column, value] of Object.entries(row)) {
      if (typeof value === 'string' && timestamps.has(column)) {
        row[column] = new Date(value);
      }
    }
    return row as R;
  }

  return {
    async query<R>(sql: string, params: unknown[] = []): Promise<QueryResult<R>> {
      const statement = db.prepare(translate(sql, toSqliteTimestamp(new Date())));
      const bindings = Object.fromEntries(params.map((value, i) => [`p${i + 1}`, bindable(value)]));

      // `reader` distinguishes SELECT / ... RETURNING from statements that
      // produce no result set; calling `all()` on the latter throws.
      if (!statement.reader) {
        statement.run(bindings);
        return { rows: [] };
      }
      const rows = statement.all(bindings) as Record<string, unknown>[];
      return { rows: rows.map((row) => revive<R>(row)) };
    },

    async end(): Promise<void> {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
