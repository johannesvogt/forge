import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pkg from 'pg';
const { Pool } = pkg;
import {
  createIssue,
  listIssues,
  getIssue,
  updateIssue,
  moveIssue,
} from './issue-service.ts';

const DB_URL = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/forge';
const pool = new Pool({ connectionString: DB_URL });

function makePgClient(pool: InstanceType<typeof Pool>) {
  return {
    issue: {
      create: async ({ data }: { data: { title: string; description?: string; column?: string } }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "Issue" (id, title, description, "column", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5) RETURNING *`,
          [id, data.title, data.description ?? '', data.column ?? 'BACKLOG', now]
        );
        return r.rows[0];
      },
      findMany: async ({ where }: { where?: { column?: string } } = {}) => {
        if (where?.column) {
          const r = await pool.query(`SELECT * FROM "Issue" WHERE "column" = $1 ORDER BY "createdAt" ASC`, [where.column]);
          return r.rows;
        }
        const r = await pool.query(`SELECT * FROM "Issue" ORDER BY "createdAt" ASC`);
        return r.rows;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const r = await pool.query(`SELECT * FROM "Issue" WHERE id = $1`, [where.id]);
        return r.rows[0] ?? null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<{ title: string; description: string; column: string; updatedAt: Date }> }) => {
        const entries = Object.entries(data).filter(([, v]) => v !== undefined);
        const fields = entries.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
        const values = entries.map(([, v]) => v);
        const r = await pool.query(
          `UPDATE "Issue" SET ${fields} WHERE id = $1 RETURNING *`,
          [where.id, ...values]
        );
        return r.rows[0];
      },
      deleteMany: async ({ where }: { where: { title?: { startsWith?: string } } }) => {
        if (where.title?.startsWith) {
          await pool.query(`DELETE FROM "Issue" WHERE title LIKE $1`, [`${where.title.startsWith}%`]);
        }
      },
    },
  };
}

type DbClient = ReturnType<typeof makePgClient>;
let db: DbClient;

before(() => {
  db = makePgClient(pool);
});

after(async () => {
  await db.issue.deleteMany({ where: { title: { startsWith: 'test-issue-' } } });
  await pool.end();
});

describe('createIssue', () => {
  it('creates an issue with BACKLOG as default column', async () => {
    const issue = await createIssue(db as any, { title: 'test-issue-alpha', description: 'desc' });
    assert.equal(issue.title, 'test-issue-alpha');
    assert.equal(issue.column, 'BACKLOG');
    assert.ok(issue.id.length > 0);
  });

  it('creates an issue in a specified column', async () => {
    const issue = await createIssue(db as any, { title: 'test-issue-beta', column: 'TODO' });
    assert.equal(issue.column, 'TODO');
  });

  it('defaults description to empty string', async () => {
    const issue = await createIssue(db as any, { title: 'test-issue-gamma' });
    assert.equal(issue.description, '');
  });
});

describe('listIssues', () => {
  it('returns all issues when no column filter', async () => {
    const issues = await listIssues(db as any);
    assert.ok(Array.isArray(issues));
    assert.ok(issues.length >= 3);
  });

  it('filters by column', async () => {
    const todoIssues = await listIssues(db as any, 'TODO');
    assert.ok(todoIssues.every((i) => i.column === 'TODO'));
  });
});

describe('getIssue', () => {
  it('returns the issue by id', async () => {
    const created = await createIssue(db as any, { title: 'test-issue-delta' });
    const found = await getIssue(db as any, created.id);
    assert.ok(found !== null);
    assert.equal(found.id, created.id);
    assert.equal(found.title, 'test-issue-delta');
  });

  it('returns null for unknown id', async () => {
    const found = await getIssue(db as any, 'nonexistent-id-00000');
    assert.equal(found, null);
  });
});

describe('updateIssue', () => {
  it('updates title and description', async () => {
    const issue = await createIssue(db as any, { title: 'test-issue-epsilon' });
    const updated = await updateIssue(db as any, issue.id, { title: 'test-issue-epsilon-new', description: 'updated' });
    assert.equal(updated.title, 'test-issue-epsilon-new');
    assert.equal(updated.description, 'updated');
  });
});

describe('moveIssue', () => {
  it('moves to a valid next column', async () => {
    const issue = await createIssue(db as any, { title: 'test-issue-zeta' });
    const moved = await moveIssue(db as any, issue.id, 'TODO');
    assert.equal(moved.column, 'TODO');
  });

  it('throws on invalid transition', async () => {
    const issue = await createIssue(db as any, { title: 'test-issue-eta' });
    await assert.rejects(
      () => moveIssue(db as any, issue.id, 'DONE'),
      (err: Error) => {
        assert.match(err.message, /invalid transition/i);
        return true;
      }
    );
  });

  it('throws when issue not found', async () => {
    await assert.rejects(
      () => moveIssue(db as any, 'no-such-id-999', 'TODO'),
      (err: Error) => {
        assert.match(err.message, /not found/i);
        return true;
      }
    );
  });

  it('chains multiple valid transitions', async () => {
    const issue = await createIssue(db as any, { title: 'test-issue-theta' });
    await moveIssue(db as any, issue.id, 'TODO');
    await moveIssue(db as any, issue.id, 'IN_PROGRESS');
    const moved = await moveIssue(db as any, issue.id, 'NEEDS_HUMAN_REVIEW');
    assert.equal(moved.column, 'NEEDS_HUMAN_REVIEW');
  });
});
