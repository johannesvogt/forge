import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pkg from 'pg';
const { Pool } = pkg;
import {
  addComment,
  listComments,
  resolveComment,
  type Comment,
  type DiffLineAnchor,
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
          anchorStart?: number | null;
          anchorEnd?: number | null;
          anchorFilePath?: string | null;
        };
      }): Promise<Comment> => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "Comment" (id, "targetType", "targetId", body, "authorUserId", "authorLabel", status, "createdAt", "anchorStart", "anchorEnd", "anchorFilePath")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [
            id,
            data.targetType,
            data.targetId,
            data.body,
            data.authorUserId ?? null,
            data.authorLabel,
            data.status ?? 'open',
            now,
            data.anchorStart ?? null,
            data.anchorEnd ?? null,
            data.anchorFilePath ?? null,
          ]
        );
        return r.rows[0];
      },
      findMany: async ({ where, orderBy }: {
        where: { targetType: string; targetId: string; anchorStart?: number | null; anchorEnd?: number | null; anchorFilePath?: string | null };
        orderBy: { createdAt: 'asc' | 'desc' };
      }): Promise<Comment[]> => {
        const dir = orderBy.createdAt === 'asc' ? 'ASC' : 'DESC';
        const conditions: string[] = [`"targetType" = $1`, `"targetId" = $2`];
        const values: (string | number | null)[] = [where.targetType, where.targetId];
        if (where.anchorStart !== undefined) {
          conditions.push(`"anchorStart" = $${values.length + 1}`);
          values.push(where.anchorStart);
        }
        if (where.anchorEnd !== undefined) {
          conditions.push(`"anchorEnd" = $${values.length + 1}`);
          values.push(where.anchorEnd);
        }
        if (where.anchorFilePath !== undefined) {
          conditions.push(`"anchorFilePath" = $${values.length + 1}`);
          values.push(where.anchorFilePath);
        }
        const r = await pool.query(
          `SELECT * FROM "Comment" WHERE ${conditions.join(' AND ')} ORDER BY "createdAt" ${dir}`,
          values
        );
        return r.rows;
      },
      update: async ({ where, data }: {
        where: { id: string };
        data: { status: string };
      }): Promise<Comment> => {
        const r = await pool.query(
          `UPDATE "Comment" SET status = $1 WHERE id = $2 RETURNING *`,
          [data.status, where.id]
        );
        if (r.rows.length === 0) throw new Error(`Comment not found: ${where.id}`);
        return r.rows[0];
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
  await pool.query(`DELETE FROM "Comment" WHERE "targetId" LIKE 'test-comment-issue-%' OR "targetId" LIKE 'test-doc-version-%' OR "targetId" LIKE 'test-diff-%'`);
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

describe('inline document section comments', () => {
  it('adds an inline comment with anchorStart and anchorEnd', async () => {
    const versionId = `test-doc-version-${crypto.randomUUID()}`;
    const comment = await addComment(db as any, {
      targetType: 'document_section',
      targetId: versionId,
      body: 'This paragraph needs revision.',
      authorUserId: 'user-10',
      authorLabel: 'Eve',
      anchorStart: 42,
      anchorEnd: 85,
    });
    assert.equal(comment.targetType, 'document_section');
    assert.equal(comment.targetId, versionId);
    assert.equal(comment.body, 'This paragraph needs revision.');
    assert.equal(comment.anchorStart, 42);
    assert.equal(comment.anchorEnd, 85);
    assert.equal(comment.status, 'open');
  });

  it('stores null anchor fields for issue comments', async () => {
    const targetId = `test-comment-issue-${crypto.randomUUID()}`;
    const comment = await addComment(db as any, {
      targetType: 'issue',
      targetId,
      body: 'Plain issue comment',
      authorLabel: 'Frank',
    });
    assert.equal(comment.anchorStart, null);
    assert.equal(comment.anchorEnd, null);
  });

  it('listComments with anchor filter returns only matching anchor', async () => {
    const versionId = `test-doc-version-${crypto.randomUUID()}`;
    await addComment(db as any, {
      targetType: 'document_section',
      targetId: versionId,
      body: 'Comment on range A',
      authorLabel: 'Alice',
      anchorStart: 0,
      anchorEnd: 50,
    });
    await addComment(db as any, {
      targetType: 'document_section',
      targetId: versionId,
      body: 'Comment on range B',
      authorLabel: 'Bob',
      anchorStart: 100,
      anchorEnd: 200,
    });

    const rangeA = await listComments(db as any, 'document_section', versionId, { startOffset: 0, endOffset: 50 });
    assert.equal(rangeA.length, 1);
    assert.equal(rangeA[0].body, 'Comment on range A');

    const rangeB = await listComments(db as any, 'document_section', versionId, { startOffset: 100, endOffset: 200 });
    assert.equal(rangeB.length, 1);
    assert.equal(rangeB[0].body, 'Comment on range B');
  });

  it('listComments without anchor returns all comments for the version', async () => {
    const versionId = `test-doc-version-${crypto.randomUUID()}`;
    await addComment(db as any, { targetType: 'document_section', targetId: versionId, body: 'C1', authorLabel: 'Alice', anchorStart: 0, anchorEnd: 10 });
    await addComment(db as any, { targetType: 'document_section', targetId: versionId, body: 'C2', authorLabel: 'Bob', anchorStart: 20, anchorEnd: 30 });

    const all = await listComments(db as any, 'document_section', versionId);
    assert.equal(all.length, 2);
  });
});

describe('resolveComment', () => {
  it('sets status to resolved', async () => {
    const targetId = `test-comment-issue-${crypto.randomUUID()}`;
    const comment = await addComment(db as any, {
      targetType: 'issue',
      targetId,
      body: 'Needs fixing',
      authorLabel: 'Alice',
    });
    assert.equal(comment.status, 'open');

    const resolved = await resolveComment(db as any, comment.id);
    assert.equal(resolved.id, comment.id);
    assert.equal(resolved.status, 'resolved');
  });

  it('resolved comment is returned with resolved status in listComments', async () => {
    const targetId = `test-comment-issue-${crypto.randomUUID()}`;
    const comment = await addComment(db as any, {
      targetType: 'issue',
      targetId,
      body: 'Will resolve',
      authorLabel: 'Bob',
    });
    await resolveComment(db as any, comment.id);

    const comments = await listComments(db as any, 'issue', targetId);
    assert.equal(comments.length, 1);
    assert.equal(comments[0].status, 'resolved');
  });
});

describe('diff line comments', () => {
  it('adds a diff line comment with file path and line number', async () => {
    const diffId = `test-diff-${crypto.randomUUID()}`;
    const anchor: DiffLineAnchor = { filePath: 'src/foo.ts', lineNumber: 42 };
    const comment = await addComment(db as any, {
      targetType: 'diff_line',
      targetId: diffId,
      body: 'This line looks wrong.',
      authorUserId: 'user-10',
      authorLabel: 'Alice',
      anchorFilePath: anchor.filePath,
      anchorStart: anchor.lineNumber,
    });
    assert.equal(comment.targetType, 'diff_line');
    assert.equal(comment.targetId, diffId);
    assert.equal(comment.body, 'This line looks wrong.');
    assert.equal(comment.anchorFilePath, 'src/foo.ts');
    assert.equal(comment.anchorStart, 42);
    assert.equal(comment.status, 'open');
  });

  it('listComments with DiffLineAnchor returns only comments for that file and line', async () => {
    const diffId = `test-diff-${crypto.randomUUID()}`;
    await addComment(db as any, {
      targetType: 'diff_line', targetId: diffId, body: 'Line 5 comment', authorLabel: 'Alice',
      anchorFilePath: 'src/foo.ts', anchorStart: 5,
    });
    await addComment(db as any, {
      targetType: 'diff_line', targetId: diffId, body: 'Line 10 comment', authorLabel: 'Bob',
      anchorFilePath: 'src/foo.ts', anchorStart: 10,
    });
    await addComment(db as any, {
      targetType: 'diff_line', targetId: diffId, body: 'Other file comment', authorLabel: 'Carol',
      anchorFilePath: 'src/bar.ts', anchorStart: 5,
    });

    const line5 = await listComments(db as any, 'diff_line', diffId, { filePath: 'src/foo.ts', lineNumber: 5 } as DiffLineAnchor);
    assert.equal(line5.length, 1);
    assert.equal(line5[0].body, 'Line 5 comment');

    const line10 = await listComments(db as any, 'diff_line', diffId, { filePath: 'src/foo.ts', lineNumber: 10 } as DiffLineAnchor);
    assert.equal(line10.length, 1);
    assert.equal(line10[0].body, 'Line 10 comment');
  });

  it('comments on diff A are not shown when listing diff B', async () => {
    const diffA = `test-diff-${crypto.randomUUID()}`;
    const diffB = `test-diff-${crypto.randomUUID()}`;
    await addComment(db as any, {
      targetType: 'diff_line', targetId: diffA, body: 'Diff A comment', authorLabel: 'Alice',
      anchorFilePath: 'src/foo.ts', anchorStart: 1,
    });

    const diffBComments = await listComments(db as any, 'diff_line', diffB);
    assert.equal(diffBComments.length, 0);

    const diffAComments = await listComments(db as any, 'diff_line', diffA);
    assert.equal(diffAComments.length, 1);
    assert.equal(diffAComments[0].body, 'Diff A comment');
  });

  it('resolves a diff line comment', async () => {
    const diffId = `test-diff-${crypto.randomUUID()}`;
    const comment = await addComment(db as any, {
      targetType: 'diff_line', targetId: diffId, body: 'Needs fix', authorLabel: 'Alice',
      anchorFilePath: 'src/foo.ts', anchorStart: 7,
    });
    assert.equal(comment.status, 'open');

    const resolved = await resolveComment(db as any, comment.id);
    assert.equal(resolved.id, comment.id);
    assert.equal(resolved.status, 'resolved');
  });
});
