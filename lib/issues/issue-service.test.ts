import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestPool, type TestPool } from '../test-support/db.ts';
import {
  createIssue,
  listIssues,
  getIssue,
  updateIssue,
  moveIssue,
} from './issue-service.ts';

const pool = createTestPool();

const TEST_RUN = crypto.randomUUID().slice(0, 8);
let testUserId: string;
let projectAId: string;
let projectBId: string;

function makeDbClient(pool: TestPool) {
  return {
    project: {
      update: async ({ where }: { where: { id: string } }) => {
        const r = await pool.query(
          `UPDATE "Project" SET "issueCounter" = "issueCounter" + 1 WHERE id = $1 RETURNING "issueCounter", name`,
          [where.id]
        );
        return r.rows[0];
      },
    },
    issue: {
      create: async ({ data }: { data: { key: string; title: string; description?: string; column?: string; projectId: string } }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "Issue" (id, "key", title, description, "column", "projectId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
          [id, data.key, data.title, data.description ?? '', data.column ?? 'BACKLOG', data.projectId, now]
        );
        return r.rows[0];
      },
      findMany: async ({ where }: { where?: { projectId?: string; column?: string } } = {}) => {
        const conditions: string[] = [];
        const params: unknown[] = [];
        if (where?.projectId) {
          params.push(where.projectId);
          conditions.push(`"projectId" = $${params.length}`);
        }
        if (where?.column) {
          params.push(where.column);
          conditions.push(`"column" = $${params.length}`);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const r = await pool.query(`SELECT * FROM "Issue" ${whereClause} ORDER BY "createdAt" ASC`, params);
        return r.rows;
      },
      findUnique: async ({ where }: { where: { id?: string; key?: string; projectId?: string } }) => {
        const field = where.key !== undefined ? 'key' : 'id';
        const value = where.key ?? where.id;
        let q = `SELECT * FROM "Issue" WHERE "${field}" = $1`;
        const params: unknown[] = [value];
        if (where.projectId) {
          params.push(where.projectId);
          q += ` AND "projectId" = $${params.length}`;
        }
        const r = await pool.query(q, params);
        return r.rows[0] ?? null;
      },
      update: async ({ where, data }: { where: { id: string; projectId?: string }; data: Partial<{ title: string; description: string; column: string; updatedAt: Date }> }) => {
        const entries = Object.entries(data).filter(([, v]) => v !== undefined);
        const fields = entries.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
        const values = entries.map(([, v]) => v);
        let q = `UPDATE "Issue" SET ${fields} WHERE id = $1`;
        const params: unknown[] = [where.id, ...values];
        if (where.projectId) {
          params.push(where.projectId);
          q += ` AND "projectId" = $${params.length}`;
        }
        q += ' RETURNING *';
        const r = await pool.query(q, params);
        return r.rows[0];
      },
      deleteMany: async ({ where }: { where: { projectId?: string } }) => {
        if (where.projectId) {
          await pool.query(`DELETE FROM "Issue" WHERE "projectId" = $1`, [where.projectId]);
        }
      },
    },
    issueDependency: {
      findMany: async ({ where }: { where: { dependentId?: string; dependsOnId?: string } }) => {
        const field = where.dependentId !== undefined ? 'dependentId' : 'dependsOnId';
        const value = where.dependentId ?? where.dependsOnId;
        const r = await pool.query(`SELECT * FROM "IssueDependency" WHERE "${field}" = $1`, [value]);
        return r.rows;
      },
    },
  };
}

type DbClient = ReturnType<typeof makeDbClient>;
let db: DbClient;

before(async () => {
  db = makeDbClient(pool);
  const userId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO "User" (id, email, "passwordHash", "createdAt", "updatedAt") VALUES ($1,$2,$3,now(),now())`,
    [userId, `test-issue-${TEST_RUN}@example.com`, 'hash']
  );
  testUserId = userId;

  const pAId = crypto.randomUUID();
  const pBId = crypto.randomUUID();
  const now = new Date();
  await pool.query(
    `INSERT INTO "Project" (id, name, slug, "createdByUserId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5),($6,$7,$8,$4,$5,$5)`,
    [pAId, `Issue Test A ${TEST_RUN}`, `issue-a-${TEST_RUN}`, userId, now, pBId, `Issue Test B ${TEST_RUN}`, `issue-b-${TEST_RUN}`]
  );
  projectAId = pAId;
  projectBId = pBId;
});

after(async () => {
  await pool.query(`DELETE FROM "Project" WHERE "createdByUserId" = $1`, [testUserId]);
  await pool.query(`DELETE FROM "User" WHERE id = $1`, [testUserId]);
  await pool.end();
});

describe('createIssue', () => {
  it('creates an issue with BACKLOG as default column', async () => {
    const issue = await createIssue(db as any, projectAId, { title: 'test-issue-alpha', description: 'desc' });
    assert.equal(issue.title, 'test-issue-alpha');
    assert.equal(issue.column, 'BACKLOG');
    assert.equal(issue.projectId, projectAId);
    assert.ok(issue.id.length > 0);
  });

  it('creates an issue in a specified column', async () => {
    const issue = await createIssue(db as any, projectAId, { title: 'test-issue-beta', column: 'TODO' });
    assert.equal(issue.column, 'TODO');
  });

  it('defaults description to empty string', async () => {
    const issue = await createIssue(db as any, projectAId, { title: 'test-issue-gamma' });
    assert.equal(issue.description, '');
  });
});

describe('listIssues', () => {
  it('returns all issues for the project when no column filter', async () => {
    const issues = await listIssues(db as any, projectAId);
    assert.ok(Array.isArray(issues));
    assert.ok(issues.every((i) => i.projectId === projectAId));
  });

  it('filters by column', async () => {
    const todoIssues = await listIssues(db as any, projectAId, 'TODO');
    assert.ok(todoIssues.every((i) => i.column === 'TODO'));
  });

  it('does not return issues from another project', async () => {
    await createIssue(db as any, projectAId, { title: 'proj-a-only' });
    await createIssue(db as any, projectBId, { title: 'proj-b-only' });

    const issuesA = await listIssues(db as any, projectAId);
    const issuesB = await listIssues(db as any, projectBId);

    assert.ok(issuesA.every((i) => i.projectId === projectAId), 'project A issues should only have projectId A');
    assert.ok(issuesB.every((i) => i.projectId === projectBId), 'project B issues should only have projectId B');
    assert.ok(!issuesA.some((i) => i.title === 'proj-b-only'));
    assert.ok(!issuesB.some((i) => i.title === 'proj-a-only'));
  });
});

describe('getIssue', () => {
  it('returns the issue by id within the correct project', async () => {
    const created = await createIssue(db as any, projectAId, { title: 'test-issue-delta' });
    const found = await getIssue(db as any, projectAId, created.id);
    assert.ok(found !== null);
    assert.equal(found.id, created.id);
    assert.equal(found.title, 'test-issue-delta');
  });

  it('returns null for unknown id', async () => {
    const found = await getIssue(db as any, projectAId, 'nonexistent-id-00000');
    assert.equal(found, null);
  });

  it('returns null when issue belongs to a different project', async () => {
    const created = await createIssue(db as any, projectBId, { title: 'cross-project-issue' });
    const found = await getIssue(db as any, projectAId, created.id);
    assert.equal(found, null);
  });
});

describe('updateIssue', () => {
  it('updates title and description', async () => {
    const issue = await createIssue(db as any, projectAId, { title: 'test-issue-epsilon' });
    const updated = await updateIssue(db as any, projectAId, issue.id, { title: 'test-issue-epsilon-new', description: 'updated' });
    assert.equal(updated.title, 'test-issue-epsilon-new');
    assert.equal(updated.description, 'updated');
  });
});

describe('moveIssue', () => {
  it('moves to a valid next column', async () => {
    const issue = await createIssue(db as any, projectAId, { title: 'test-issue-zeta' });
    const moved = await moveIssue(db as any, projectAId, issue.id, 'TODO');
    assert.equal(moved.column, 'TODO');
  });

  it('throws on invalid transition', async () => {
    const issue = await createIssue(db as any, projectAId, { title: 'test-issue-eta' });
    await assert.rejects(
      () => moveIssue(db as any, projectAId, issue.id, 'DONE'),
      (err: Error) => {
        assert.match(err.message, /invalid transition/i);
        return true;
      }
    );
  });

  it('throws when issue not found', async () => {
    await assert.rejects(
      () => moveIssue(db as any, projectAId, 'no-such-id-999', 'TODO'),
      (err: Error) => {
        assert.match(err.message, /not found/i);
        return true;
      }
    );
  });

  it('chains multiple valid transitions', async () => {
    const issue = await createIssue(db as any, projectAId, { title: 'test-issue-theta' });
    await moveIssue(db as any, projectAId, issue.id, 'TODO');
    await moveIssue(db as any, projectAId, issue.id, 'IN_PROGRESS');
    const moved = await moveIssue(db as any, projectAId, issue.id, 'NEEDS_HUMAN_REVIEW');
    assert.equal(moved.column, 'NEEDS_HUMAN_REVIEW');
  });

  it('moves an issue from agent review back to TODO', async () => {
    const issue = await createIssue(db as any, projectAId, { title: 'test-issue-review-return' });
    await moveIssue(db as any, projectAId, issue.id, 'TODO');
    await moveIssue(db as any, projectAId, issue.id, 'IN_PROGRESS');
    await moveIssue(db as any, projectAId, issue.id, 'NEEDS_AGENT_REVIEW');

    const moved = await moveIssue(db as any, projectAId, issue.id, 'TODO');

    assert.equal(moved.column, 'TODO');
  });
});
