import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pkg from 'pg';
const { Pool } = pkg;
import {
  addComment,
  listComments,
  type Comment,
} from './comment-service.ts';

const DB_URL = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/forge';
const pool = new Pool({ connectionString: DB_URL });

const TEST_ISSUE_ID = `test-comment-issue-${crypto.randomUUID()}`;
const TEST_ISSUE_ID_2 = `test-comment-issue-${crypto.randomUUID()}`;

function makePgClient(pool: InstanceType<typeof Pool>) {
  return {
    comment: {
      create: async ({ data }: {
        data: {
          targetType: string;
          targetId: string;
          body: string;
          authorUserId?: string | null;
          authorLabel: string;
          status?: string;
        };
      }): Promise<Comment> => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "Comment" (id, "targetType", "targetId", body, "authorUserId", "authorLabel", status, "createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [
            id,
            data.targetType,
            data.targetId,
            data.body,
            data.authorUserId ?? null,
            data.authorLabel,
            data.status ?? 'open',
            now,
          ]
        );
        return r.rows[0];
      },
      findMany: async ({ where, orderBy }: {
        where: { targetType: string; targetId: string };
        orderBy: { createdAt: 'asc' | 'desc' };
      }): Promise<Comment[]> => {
        const dir = orderBy.createdAt === 'asc' ? 'ASC' : 'DESC';
        const r = await pool.query(
          `SELECT * FROM "Comment" WHERE "targetType" = $1 AND "targetId" = $2 ORDER BY "createdAt" ${dir}`,
          [where.targetType, where.targetId]
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
  await pool.query(`DELETE FROM "Comment" WHERE "targetId" LIKE 'test-comment-issue-%'`);
  await pool.end();
});

describe('addComment', () => {
  it('adds a comment to an issue with a human author', async () => {
    const comment = await addComment(db as any, {
      targetType: 'issue',
      targetId: TEST_ISSUE_ID,
      body: 'This is a human comment.',
      authorUserId: 'user-001',
      authorLabel: 'Alice',
    });
    assert.equal(comment.targetType, 'issue');
    assert.equal(comment.targetId, TEST_ISSUE_ID);
    assert.equal(comment.body, 'This is a human comment.');
    assert.equal(comment.authorUserId, 'user-001');
    assert.equal(comment.authorLabel, 'Alice');
    assert.equal(comment.status, 'open');
    assert.ok(comment.id.length > 0);
    assert.ok(comment.createdAt instanceof Date || typeof comment.createdAt === 'string');
  });

  it('adds a comment to an issue with an agent author (no userId)', async () => {
    const comment = await addComment(db as any, {
      targetType: 'issue',
      targetId: TEST_ISSUE_ID,
      body: 'Agent analysis complete.',
      authorUserId: null,
      authorLabel: 'my-agent-key',
    });
    assert.equal(comment.authorUserId, null);
    assert.equal(comment.authorLabel, 'my-agent-key');
    assert.equal(comment.status, 'open');
  });

  it('records comments on different targets independently', async () => {
    await addComment(db as any, {
      targetType: 'issue',
      targetId: TEST_ISSUE_ID,
      body: 'Comment on issue 1',
      authorLabel: 'Bob',
    });
    await addComment(db as any, {
      targetType: 'issue',
      targetId: TEST_ISSUE_ID_2,
      body: 'Comment on issue 2',
      authorLabel: 'Carol',
    });
    const comments1 = await listComments(db as any, 'issue', TEST_ISSUE_ID);
    const comments2 = await listComments(db as any, 'issue', TEST_ISSUE_ID_2);
    assert.ok(comments1.every((c) => c.targetId === TEST_ISSUE_ID));
    assert.ok(comments2.every((c) => c.targetId === TEST_ISSUE_ID_2));
  });
});

describe('listComments', () => {
  it('returns comments in chronological order', async () => {
    const targetId = `test-comment-issue-${crypto.randomUUID()}`;
    await addComment(db as any, { targetType: 'issue', targetId, body: 'First', authorLabel: 'Alice' });
    await addComment(db as any, { targetType: 'issue', targetId, body: 'Second', authorLabel: 'Bob' });
    await addComment(db as any, { targetType: 'issue', targetId, body: 'Third', authorLabel: 'Carol' });

    const comments = await listComments(db as any, 'issue', targetId);
    assert.equal(comments.length, 3);
    assert.equal(comments[0].body, 'First');
    assert.equal(comments[1].body, 'Second');
    assert.equal(comments[2].body, 'Third');
  });

  it('returns empty array when no comments exist for target', async () => {
    const comments = await listComments(db as any, 'issue', 'nonexistent-target-id');
    assert.deepEqual(comments, []);
  });

  it('only returns comments for the specific targetType and targetId', async () => {
    const targetId = `test-comment-issue-${crypto.randomUUID()}`;
    await addComment(db as any, { targetType: 'issue', targetId, body: 'Issue comment', authorLabel: 'Alice' });
    await addComment(db as any, { targetType: 'document_section', targetId, body: 'Doc comment', authorLabel: 'Bob' });

    const issueComments = await listComments(db as any, 'issue', targetId);
    assert.equal(issueComments.length, 1);
    assert.equal(issueComments[0].body, 'Issue comment');

    const docComments = await listComments(db as any, 'document_section', targetId);
    assert.equal(docComments.length, 1);
    assert.equal(docComments[0].body, 'Doc comment');
  });

  it('includes all comment fields in returned data', async () => {
    const targetId = `test-comment-issue-${crypto.randomUUID()}`;
    await addComment(db as any, {
      targetType: 'issue',
      targetId,
      body: 'Full field check',
      authorUserId: 'user-42',
      authorLabel: 'Dave',
    });
    const comments = await listComments(db as any, 'issue', targetId);
    assert.equal(comments.length, 1);
    const c = comments[0];
    assert.ok(c.id);
    assert.equal(c.targetType, 'issue');
    assert.equal(c.targetId, targetId);
    assert.equal(c.body, 'Full field check');
    assert.equal(c.authorUserId, 'user-42');
    assert.equal(c.authorLabel, 'Dave');
    assert.equal(c.status, 'open');
    assert.ok(c.createdAt);
  });
});
