import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pkg from 'pg';
const { Pool } = pkg;
import { uploadDiff, getDiff, listDiffsByIssue, type Diff } from './diff-service.ts';

const DB_URL = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/forge';
const pool = new Pool({ connectionString: DB_URL });

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
          authorUserId?: string | null;
          authorLabel: string;
        };
      }): Promise<Diff> => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "Diff" (id, title, description, branch, "diffText", "issueId", "authorUserId", "authorLabel", "createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [
            id,
            data.title,
            data.description ?? '',
            data.branch,
            data.diffText,
            data.issueId,
            data.authorUserId ?? null,
            data.authorLabel,
            now,
          ]
        );
        return r.rows[0];
      },
      findUnique: async ({ where }: { where: { id: string } }): Promise<Diff | null> => {
        const r = await pool.query(`SELECT * FROM "Diff" WHERE id = $1`, [where.id]);
        return r.rows[0] ?? null;
      },
      findMany: async ({ where, orderBy }: {
        where: { issueId: string };
        orderBy: { createdAt: 'asc' | 'desc' };
      }): Promise<Diff[]> => {
        const dir = orderBy.createdAt === 'asc' ? 'ASC' : 'DESC';
        const r = await pool.query(
          `SELECT * FROM "Diff" WHERE "issueId" = $1 ORDER BY "createdAt" ${dir}`,
          [where.issueId]
        );
        return r.rows;
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
  await pool.query(`DELETE FROM "Diff" WHERE "issueId" LIKE 'test-diff-issue-%'`);
  await pool.end();
});

describe('uploadDiff', () => {
  it('creates a diff with all required fields', async () => {
    const diff = await uploadDiff(db as any, {
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
    assert.equal(diff.authorUserId, 'user-001');
    assert.equal(diff.authorLabel, 'Alice');
    assert.ok(diff.id.length > 0);
    assert.ok(diff.createdAt instanceof Date || typeof diff.createdAt === 'string');
  });

  it('creates a diff with an agent author (no userId)', async () => {
    const diff = await uploadDiff(db as any, {
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
    const diff = await uploadDiff(db as any, {
      title: 'No description diff',
      branch: 'feat/no-desc',
      diffText: '+line',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Bob',
    });
    assert.equal(diff.description, '');
  });

  it('uploading a second diff does not modify the first', async () => {
    const first = await uploadDiff(db as any, {
      title: 'First diff',
      branch: 'feat/v1',
      diffText: '+first',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Alice',
    });
    await uploadDiff(db as any, {
      title: 'Second diff',
      branch: 'feat/v2',
      diffText: '+second',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Alice',
    });
    const refetched = await getDiff(db as any, first.id);
    assert.ok(refetched !== null);
    assert.equal(refetched.title, 'First diff');
    assert.equal(refetched.diffText, '+first');
  });
});

describe('getDiff', () => {
  it('returns a diff by id with all fields', async () => {
    const created = await uploadDiff(db as any, {
      title: 'Diff to fetch',
      description: 'A test diff',
      branch: 'feat/fetch',
      diffText: '+fetched',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Carol',
    });
    const fetched = await getDiff(db as any, created.id);
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
    const result = await getDiff(db as any, 'nonexistent-diff-id');
    assert.equal(result, null);
  });
});

describe('listDiffsByIssue', () => {
  it('returns diffs for an issue in chronological order', async () => {
    const issueId = `test-diff-issue-${crypto.randomUUID()}`;
    const first = await uploadDiff(db as any, { title: 'First', branch: 'b1', diffText: '+a', issueId, authorLabel: 'X' });
    const second = await uploadDiff(db as any, { title: 'Second', branch: 'b2', diffText: '+b', issueId, authorLabel: 'X' });

    const diffs = await listDiffsByIssue(db as any, issueId);
    assert.equal(diffs.length, 2);
    assert.equal(diffs[0].id, first.id);
    assert.equal(diffs[1].id, second.id);
  });

  it('returns empty array for an issue with no diffs', async () => {
    const diffs = await listDiffsByIssue(db as any, 'nonexistent-issue');
    assert.deepEqual(diffs, []);
  });

  it('isolates diffs by issueId', async () => {
    await uploadDiff(db as any, { title: 'Issue 1 diff', branch: 'b', diffText: '+x', issueId: TEST_ISSUE_ID, authorLabel: 'X' });
    await uploadDiff(db as any, { title: 'Issue 2 diff', branch: 'b', diffText: '+y', issueId: TEST_ISSUE_ID_2, authorLabel: 'Y' });

    const diffs1 = await listDiffsByIssue(db as any, TEST_ISSUE_ID);
    const diffs2 = await listDiffsByIssue(db as any, TEST_ISSUE_ID_2);

    assert.ok(diffs1.every((d) => d.issueId === TEST_ISSUE_ID));
    assert.ok(diffs2.every((d) => d.issueId === TEST_ISSUE_ID_2));
    assert.ok(diffs2.length >= 1);
  });

  it('returns multiple diffs linked to one issue as separate immutable artifacts', async () => {
    const issueId = `test-diff-issue-${crypto.randomUUID()}`;
    await uploadDiff(db as any, { title: 'Rev 1', branch: 'feat', diffText: '+rev1', issueId, authorLabel: 'Agent' });
    await uploadDiff(db as any, { title: 'Rev 2', branch: 'feat', diffText: '+rev2', issueId, authorLabel: 'Agent' });

    const diffs = await listDiffsByIssue(db as any, issueId);
    assert.equal(diffs.length, 2);
    assert.ok(diffs[0].id !== diffs[1].id);
    assert.ok(diffs[0].diffText !== diffs[1].diffText);
  });
});
