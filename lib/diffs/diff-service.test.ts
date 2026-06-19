import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pkg from 'pg';
const { Pool } = pkg;
import { uploadDiff, getDiff, listDiffsByIssue, type Diff } from './diff-service.ts';

const DB_URL = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/forge';
const pool = new Pool({ connectionString: DB_URL });

const TEST_RUN = crypto.randomUUID().slice(0, 8);
let testUserId: string;
let projectAId: string;
let projectBId: string;

const TEST_ISSUE_ID = `test-diff-issue-${crypto.randomUUID()}`;
const TEST_ISSUE_ID_2 = `test-diff-issue-${crypto.randomUUID()}`;

function makePgClient(pool: InstanceType<typeof Pool>) {
  return {
    diff: {
      create: async ({ data }: {
        data: {
          title: string;
          description?: string;
          branch: string;
          diffText: string;
          issueId: string;
          projectId: string;
          authorUserId?: string | null;
          authorLabel: string;
        };
      }): Promise<Diff> => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "Diff" (id, title, description, branch, "diffText", "issueId", "projectId", "authorUserId", "authorLabel", "createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [
            id,
            data.title,
            data.description ?? '',
            data.branch,
            data.diffText,
            data.issueId,
            data.projectId,
            data.authorUserId ?? null,
            data.authorLabel,
            now,
          ]
        );
        return r.rows[0];
      },
      findUnique: async ({ where }: { where: { id: string; projectId?: string } }): Promise<Diff | null> => {
        let q = `SELECT * FROM "Diff" WHERE id = $1`;
        const params: unknown[] = [where.id];
        if (where.projectId) {
          params.push(where.projectId);
          q += ` AND "projectId" = $${params.length}`;
        }
        const r = await pool.query(q, params);
        return r.rows[0] ?? null;
      },
      findMany: async ({ where, orderBy }: {
        where: { issueId: string; projectId?: string };
        orderBy: { createdAt: 'asc' | 'desc' };
      }): Promise<Diff[]> => {
        const dir = orderBy.createdAt === 'asc' ? 'ASC' : 'DESC';
        const conditions: string[] = [`"issueId" = $1`];
        const params: unknown[] = [where.issueId];
        if (where.projectId) {
          params.push(where.projectId);
          conditions.push(`"projectId" = $${params.length}`);
        }
        const r = await pool.query(
          `SELECT * FROM "Diff" WHERE ${conditions.join(' AND ')} ORDER BY "createdAt" ${dir}`,
          params
        );
        return r.rows;
      },
    },
  };
}

type DbClient = ReturnType<typeof makePgClient>;
let db: DbClient;

before(async () => {
  db = makePgClient(pool);
  const userId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO "User" (id, email, "passwordHash", "createdAt", "updatedAt") VALUES ($1,$2,$3,now(),now())`,
    [userId, `test-diff-${TEST_RUN}@example.com`, 'hash']
  );
  testUserId = userId;

  const pAId = crypto.randomUUID();
  const pBId = crypto.randomUUID();
  const now = new Date();
  await pool.query(
    `INSERT INTO "Project" (id, name, slug, "createdByUserId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5),($6,$7,$8,$4,$5,$5)`,
    [pAId, `Diff Test A ${TEST_RUN}`, `diff-a-${TEST_RUN}`, userId, now, pBId, `Diff Test B ${TEST_RUN}`, `diff-b-${TEST_RUN}`]
  );
  projectAId = pAId;
  projectBId = pBId;
});

after(async () => {
  await pool.query(`DELETE FROM "Project" WHERE "createdByUserId" = $1`, [testUserId]);
  await pool.query(`DELETE FROM "User" WHERE id = $1`, [testUserId]);
  await pool.end();
});

describe('uploadDiff', () => {
  it('creates a diff with all required fields', async () => {
    const diff = await uploadDiff(db as any, projectAId, {
      title: 'Fix auth bug',
      description: 'Fixes the login redirect issue',
      branch: 'fix/auth-redirect',
      diffText: '--- a/auth.ts\n+++ b/auth.ts\n@@ -1,2 +1,3 @@\n+// fixed\n export default {}',
      issueId: TEST_ISSUE_ID,
      authorUserId: 'user-001',
      authorLabel: 'Alice',
    });
    assert.equal(diff.title, 'Fix auth bug');
    assert.equal(diff.description, 'Fixes the login redirect issue');
    assert.equal(diff.branch, 'fix/auth-redirect');
    assert.ok(diff.diffText.includes('fixed'));
    assert.equal(diff.issueId, TEST_ISSUE_ID);
    assert.equal(diff.projectId, projectAId);
    assert.equal(diff.authorUserId, 'user-001');
    assert.equal(diff.authorLabel, 'Alice');
    assert.ok(diff.id.length > 0);
    assert.ok(diff.createdAt instanceof Date || typeof diff.createdAt === 'string');
  });

  it('creates a diff with an agent author (no userId)', async () => {
    const diff = await uploadDiff(db as any, projectAId, {
      title: 'Agent-generated patch',
      branch: 'agent/patch-1',
      diffText: '--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new',
      issueId: TEST_ISSUE_ID,
      authorUserId: null,
      authorLabel: 'ci-agent',
    });
    assert.equal(diff.authorUserId, null);
    assert.equal(diff.authorLabel, 'ci-agent');
  });

  it('defaults description to empty string when not provided', async () => {
    const diff = await uploadDiff(db as any, projectAId, {
      title: 'No description diff',
      branch: 'feat/no-desc',
      diffText: '+line',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Bob',
    });
    assert.equal(diff.description, '');
  });

  it('uploading a second diff does not modify the first', async () => {
    const first = await uploadDiff(db as any, projectAId, {
      title: 'First diff',
      branch: 'feat/v1',
      diffText: '+first',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Alice',
    });
    await uploadDiff(db as any, projectAId, {
      title: 'Second diff',
      branch: 'feat/v2',
      diffText: '+second',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Alice',
    });
    const refetched = await getDiff(db as any, projectAId, first.id);
    assert.ok(refetched !== null);
    assert.equal(refetched.title, 'First diff');
    assert.equal(refetched.diffText, '+first');
  });
});

describe('getDiff', () => {
  it('returns a diff by id with all fields', async () => {
    const created = await uploadDiff(db as any, projectAId, {
      title: 'Diff to fetch',
      description: 'A test diff',
      branch: 'feat/fetch',
      diffText: '+fetched',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Carol',
    });
    const fetched = await getDiff(db as any, projectAId, created.id);
    assert.ok(fetched !== null);
    assert.equal(fetched.id, created.id);
    assert.equal(fetched.title, 'Diff to fetch');
    assert.equal(fetched.description, 'A test diff');
    assert.equal(fetched.branch, 'feat/fetch');
    assert.equal(fetched.diffText, '+fetched');
    assert.equal(fetched.issueId, TEST_ISSUE_ID);
    assert.equal(fetched.authorLabel, 'Carol');
  });

  it('returns null for a non-existent id', async () => {
    const result = await getDiff(db as any, projectAId, 'nonexistent-diff-id');
    assert.equal(result, null);
  });

  it('returns null when diff belongs to a different project', async () => {
    const diff = await uploadDiff(db as any, projectBId, {
      title: 'Cross project diff',
      branch: 'feat/cross',
      diffText: '+cross',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Agent',
    });
    const result = await getDiff(db as any, projectAId, diff.id);
    assert.equal(result, null);
  });
});

describe('listDiffsByIssue', () => {
  it('returns diffs for an issue in chronological order', async () => {
    const issueId = `test-diff-issue-${crypto.randomUUID()}`;
    const first = await uploadDiff(db as any, projectAId, { title: 'First', branch: 'b1', diffText: '+a', issueId, authorLabel: 'X' });
    const second = await uploadDiff(db as any, projectAId, { title: 'Second', branch: 'b2', diffText: '+b', issueId, authorLabel: 'X' });

    const diffs = await listDiffsByIssue(db as any, projectAId, issueId);
    assert.equal(diffs.length, 2);
    assert.equal(diffs[0].id, first.id);
    assert.equal(diffs[1].id, second.id);
  });

  it('returns empty array for an issue with no diffs', async () => {
    const diffs = await listDiffsByIssue(db as any, projectAId, 'nonexistent-issue');
    assert.deepEqual(diffs, []);
  });

  it('isolates diffs by issueId within a project', async () => {
    await uploadDiff(db as any, projectAId, { title: 'Issue 1 diff', branch: 'b', diffText: '+x', issueId: TEST_ISSUE_ID, authorLabel: 'X' });
    await uploadDiff(db as any, projectAId, { title: 'Issue 2 diff', branch: 'b', diffText: '+y', issueId: TEST_ISSUE_ID_2, authorLabel: 'Y' });

    const diffs1 = await listDiffsByIssue(db as any, projectAId, TEST_ISSUE_ID);
    const diffs2 = await listDiffsByIssue(db as any, projectAId, TEST_ISSUE_ID_2);

    assert.ok(diffs1.every((d) => d.issueId === TEST_ISSUE_ID));
    assert.ok(diffs2.every((d) => d.issueId === TEST_ISSUE_ID_2));
    assert.ok(diffs2.length >= 1);
  });

  it('does not return diffs from another project for the same issueId', async () => {
    const issueId = `test-diff-issue-${crypto.randomUUID()}`;
    await uploadDiff(db as any, projectAId, { title: 'Proj A diff', branch: 'b', diffText: '+a', issueId, authorLabel: 'A' });
    await uploadDiff(db as any, projectBId, { title: 'Proj B diff', branch: 'b', diffText: '+b', issueId, authorLabel: 'B' });

    const diffsA = await listDiffsByIssue(db as any, projectAId, issueId);
    const diffsB = await listDiffsByIssue(db as any, projectBId, issueId);

    assert.ok(diffsA.every((d) => d.projectId === projectAId));
    assert.ok(diffsB.every((d) => d.projectId === projectBId));
    assert.equal(diffsA.length, 1);
    assert.equal(diffsB.length, 1);
  });

  it('returns multiple diffs linked to one issue as separate immutable artifacts', async () => {
    const issueId = `test-diff-issue-${crypto.randomUUID()}`;
    await uploadDiff(db as any, projectAId, { title: 'Rev 1', branch: 'feat', diffText: '+rev1', issueId, authorLabel: 'Agent' });
    await uploadDiff(db as any, projectAId, { title: 'Rev 2', branch: 'feat', diffText: '+rev2', issueId, authorLabel: 'Agent' });

    const diffs = await listDiffsByIssue(db as any, projectAId, issueId);
    assert.equal(diffs.length, 2);
    assert.ok(diffs[0].id !== diffs[1].id);
    assert.ok(diffs[0].diffText !== diffs[1].diffText);
  });
});
