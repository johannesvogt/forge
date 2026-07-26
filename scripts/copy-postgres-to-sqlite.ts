// One-shot data copy from a Postgres Forge database into a SQLite one.
//
//   npm run db:copy-from-postgres -- --from "postgresql://user:pass@host:5432/forge"
//   npm run db:copy-from-postgres -- --from "$PG_URL" --to file:./prisma/dev.db --replace
//
// The target must already have the schema applied (`npx prisma migrate deploy`
// with DATABASE_URL pointing at it). By default the copy refuses to run unless
// every target table is empty; `--replace` clears them first.
//
// This deliberately uses the `pg` and `better-sqlite3` drivers directly rather
// than PrismaClient: the generated client speaks only the dialect it was last
// generated for, so it cannot talk to both databases in one process.

import pkg from 'pg';
import Database from 'better-sqlite3';

const { Pool, types } = pkg;

// Prisma maps DateTime to `TIMESTAMP(3)` — *without* time zone — and stores UTC
// in it. node-pg's default parser for that type (OID 1114) reads the value as
// local time, which shifts every timestamp by the host's UTC offset. Force UTC.
types.setTypeParser(1114, (value: string) => new Date(`${value}Z`));

/**
 * Insertion order: parents before children, so foreign keys resolve as we go.
 * `Comment` has no foreign keys and `DocumentIssueLink.issueId` is a plain
 * column, so their position only needs to be self-consistent.
 */
const TABLES = [
  'User',
  'Project',
  'ApiKey',
  'Issue',
  'IssueDependency',
  'Document',
  'DocumentVersion',
  'DocumentIssueLink',
  'Diff',
  'Skill',
  'SkillFile',
  'ProjectContext',
  'Comment',
] as const;

/** Prisma's own migration bookkeeping — per-provider, must not be copied. */
const EXCLUDED_TABLES = new Set(['_prisma_migrations']);

interface Options {
  from: string;
  to: string;
  replace: boolean;
}

function parseArgs(argv: string[]): Options {
  const flags = new Map<string, string>();
  let replace = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--replace') {
      replace = true;
    } else if (arg.startsWith('--')) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`Missing value for ${arg}`);
      flags.set(arg.slice(2), value);
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  const from = flags.get('from') ?? process.env['POSTGRES_URL'];
  if (!from) {
    throw new Error('Source database required: pass --from "postgresql://..." or set POSTGRES_URL');
  }
  if (!from.startsWith('postgres://') && !from.startsWith('postgresql://')) {
    throw new Error(`--from must be a Postgres connection string, got: ${from}`);
  }

  const to = flags.get('to') ?? process.env['DATABASE_URL'];
  if (!to) {
    throw new Error('Target database required: pass --to file:./prisma/dev.db or set DATABASE_URL');
  }
  if (to.startsWith('postgres://') || to.startsWith('postgresql://')) {
    throw new Error(`--to must be a SQLite database, got: ${to}`);
  }

  return { from, to, replace };
}

/** Matches how the better-sqlite3 driver adapter writes DateTime values. */
function toSqliteValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString().replace('Z', '+00:00');
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const pool = new Pool({ connectionString: options.from });
  const sqlite = new Database(options.to.replace(/^file:/, ''));

  try {
    const present = new Set(
      sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
        .all()
        .map((row) => (row as { name: string }).name)
        .filter((name) => !EXCLUDED_TABLES.has(name))
    );

    if (present.size === 0) {
      throw new Error(
        `Target ${options.to} has no tables. Apply the schema first:\n` +
          `  DATABASE_URL="${options.to}" npx prisma migrate deploy`
      );
    }

    // A table the schema gained but this script does not know about would be
    // silently dropped from the copy — refuse rather than lose rows.
    const unknown = [...present].filter((name) => !(TABLES as readonly string[]).includes(name));
    if (unknown.length > 0) {
      throw new Error(`Target has tables this script does not copy: ${unknown.join(', ')}`);
    }
    const missing = TABLES.filter((name) => !present.has(name));
    if (missing.length > 0) {
      throw new Error(`Target is missing tables: ${missing.join(', ')} — is the schema up to date?`);
    }

    const occupied = TABLES.filter(
      (table) => (sqlite.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get() as { c: number }).c > 0
    );
    if (occupied.length > 0 && !options.replace) {
      throw new Error(
        `Target is not empty (${occupied.join(', ')}). Re-run with --replace to overwrite it.`
      );
    }

    // Read everything before writing anything, so a source-side failure cannot
    // leave the target half-cleared.
    const rowsByTable = new Map<string, Record<string, unknown>[]>();
    const columnsByTable = new Map<string, string[]>();

    for (const table of TABLES) {
      const columns = sqlite
        .prepare(`PRAGMA table_info("${table}")`)
        .all()
        .map((row) => (row as { name: string }).name);
      columnsByTable.set(table, columns);

      const selected = columns.map((column) => `"${column}"`).join(', ');
      const result = await pool.query(`SELECT ${selected} FROM "${table}"`);
      rowsByTable.set(table, result.rows);
    }

    const copy = sqlite.transaction(() => {
      if (options.replace) {
        for (const table of [...TABLES].reverse()) {
          sqlite.prepare(`DELETE FROM "${table}"`).run();
        }
      }

      for (const table of TABLES) {
        const rows = rowsByTable.get(table)!;
        if (rows.length === 0) continue;

        const columns = columnsByTable.get(table)!;
        const statement = sqlite.prepare(
          `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')})
           VALUES (${columns.map((c) => `:${c}`).join(', ')})`
        );

        for (const row of rows) {
          statement.run(
            Object.fromEntries(columns.map((column) => [column, toSqliteValue(row[column])]))
          );
        }
      }
    });

    sqlite.pragma('foreign_keys = ON');
    copy();

    console.log(`Copied ${options.from.replace(/:[^:@/]*@/, ':***@')} -> ${options.to}\n`);
    let total = 0;
    for (const table of TABLES) {
      const expected = rowsByTable.get(table)!.length;
      const actual = (sqlite.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get() as { c: number }).c;
      if (expected !== actual) {
        throw new Error(`${table}: copied ${actual} rows but source had ${expected}`);
      }
      total += actual;
      console.log(`  ${String(expected).padStart(6)}  ${table}`);
    }
    console.log(`\n${total} rows copied.`);
  } finally {
    sqlite.close();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
