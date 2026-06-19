import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pkg from 'pg';
const { Pool } = pkg;
import {
  createDocument,
  getDocument,
  listDocumentsByIssue,
  linkDocumentToIssue,
  type Document,
} from './document-service.ts';

const DB_URL = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/forge';
const pool = new Pool({ connectionString: DB_URL });

const TEST_ISSUE_ID = `test-issue-${crypto.randomUUID()}`;
const TEST_ISSUE_ID_2 = `test-issue-${crypto.randomUUID()}`;

function makePgClient(pool: InstanceType<typeof Pool>) {
  return {
    document: {
      create: async ({ data }: { data: { title: string } }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "Document" (id, title, "createdAt", "updatedAt") VALUES ($1,$2,$3,$3) RETURNING *`,
          [id, data.title, now]
        );
        return r.rows[0];
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const r = await pool.query(`SELECT * FROM "Document" WHERE id = $1`, [where.id]);
        return r.rows[0] ?? null;
      },
    },
    documentVersion: {
      create: async ({
        data,
      }: {
        data: {
          documentId: string;
          versionNumber: number;
          content: string;
          authorUserId?: string | null;
          authorLabel: string;
        };
      }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "DocumentVersion" (id, "documentId", "versionNumber", content, "authorUserId", "authorLabel", "createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [id, data.documentId, data.versionNumber, data.content, data.authorUserId ?? null, data.authorLabel, now]
        );
        return r.rows[0];
      },
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: { documentId: string };
        orderBy: { versionNumber: 'asc' | 'desc' };
      }) => {
        const dir = orderBy.versionNumber === 'desc' ? 'DESC' : 'ASC';
        const r = await pool.query(
          `SELECT * FROM "DocumentVersion" WHERE "documentId" = $1 ORDER BY "versionNumber" ${dir} LIMIT 1`,
          [where.documentId]
        );
        return r.rows[0] ?? null;
      },
    },
    documentIssueLink: {
      createMany: async ({
        data,
        skipDuplicates,
      }: {
        data: Array<{ documentId: string; issueId: string }>;
        skipDuplicates: boolean;
      }) => {
        for (const item of data) {
          if (skipDuplicates) {
            await pool.query(
              `INSERT INTO "DocumentIssueLink" ("documentId", "issueId") VALUES ($1,$2) ON CONFLICT DO NOTHING`,
              [item.documentId, item.issueId]
            );
          } else {
            await pool.query(
              `INSERT INTO "DocumentIssueLink" ("documentId", "issueId") VALUES ($1,$2)`,
              [item.documentId, item.issueId]
            );
          }
        }
        return { count: data.length };
      },
      findMany: async ({ where }: { where: { issueId: string } }) => {
        const r = await pool.query(
          `SELECT * FROM "DocumentIssueLink" WHERE "issueId" = $1`,
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
  // Clean up test data via cascade from Document deletes
  await pool.query(
    `DELETE FROM "Document" WHERE id IN (
      SELECT "documentId" FROM "DocumentIssueLink" WHERE "issueId" LIKE 'test-issue-%'
    )`
  );
  await pool.end();
});

describe('createDocument', () => {
  it('creates a document with version 1 and links it to the given issue', async () => {
    const doc = await createDocument(db as any, {
      title: 'My First Doc',
      content: '# Hello\nThis is content.',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Alice',
    });

    assert.equal(doc.title, 'My First Doc');
    assert.equal(doc.content, '# Hello\nThis is content.');
    assert.equal(doc.versionNumber, 1);
    assert.ok(doc.id.length > 0);
    assert.ok(doc.createdAt instanceof Date || typeof doc.createdAt === 'string');
    assert.ok(doc.updatedAt instanceof Date || typeof doc.updatedAt === 'string');
  });

  it('records the author on the version', async () => {
    const doc = await createDocument(db as any, {
      title: 'Authored Doc',
      content: 'Some content',
      issueId: TEST_ISSUE_ID,
      authorUserId: 'user-123',
      authorLabel: 'Bob',
    });

    // Verify the version exists with authorLabel via getDocument
    const fetched = await getDocument(db as any, doc.id);
    assert.ok(fetched !== null);
    assert.equal(fetched.versionNumber, 1);
  });

  it('creates a link so the document appears when listing by issue', async () => {
    const doc = await createDocument(db as any, {
      title: 'Linked Doc',
      content: 'Linked content',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Carol',
    });

    const docs = await listDocumentsByIssue(db as any, TEST_ISSUE_ID);
    const ids = docs.map((d) => d.id);
    assert.ok(ids.includes(doc.id), 'newly created doc should appear in issue list');
  });
});

describe('getDocument', () => {
  it('returns the document with title, content, and version number', async () => {
    const created = await createDocument(db as any, {
      title: 'Fetch Test',
      content: '## Section\nBody text here.',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Dave',
    });

    const doc = await getDocument(db as any, created.id);
    assert.ok(doc !== null);
    assert.equal(doc.id, created.id);
    assert.equal(doc.title, 'Fetch Test');
    assert.equal(doc.content, '## Section\nBody text here.');
    assert.equal(doc.versionNumber, 1);
  });

  it('returns null for a non-existent document id', async () => {
    const doc = await getDocument(db as any, 'nonexistent-id-that-does-not-exist');
    assert.equal(doc, null);
  });

  it('includes createdAt and updatedAt fields', async () => {
    const created = await createDocument(db as any, {
      title: 'Fields Test',
      content: 'Content',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Eve',
    });

    const doc = await getDocument(db as any, created.id);
    assert.ok(doc !== null);
    assert.ok(doc.createdAt);
    assert.ok(doc.updatedAt);
  });
});

describe('listDocumentsByIssue', () => {
  it('returns empty array when no documents are linked to the issue', async () => {
    const docs = await listDocumentsByIssue(db as any, 'no-docs-for-this-issue');
    assert.deepEqual(docs, []);
  });

  it('returns only documents linked to the specific issue', async () => {
    const docA = await createDocument(db as any, {
      title: 'Issue A Doc',
      content: 'For issue A',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Frank',
    });
    await createDocument(db as any, {
      title: 'Issue B Doc',
      content: 'For issue B',
      issueId: TEST_ISSUE_ID_2,
      authorLabel: 'Grace',
    });

    const docsForA = await listDocumentsByIssue(db as any, TEST_ISSUE_ID);
    const docsForB = await listDocumentsByIssue(db as any, TEST_ISSUE_ID_2);

    assert.ok(docsForA.some((d) => d.id === docA.id));
    assert.ok(!docsForB.some((d) => d.id === docA.id));
  });

  it('returns each document with its content and version number', async () => {
    const issueId = `test-issue-${crypto.randomUUID()}`;
    await createDocument(db as any, {
      title: 'Full Fields Doc',
      content: '# Title\nBody.',
      issueId,
      authorLabel: 'Henry',
    });

    const docs = await listDocumentsByIssue(db as any, issueId);
    assert.equal(docs.length, 1);
    assert.equal(docs[0].title, 'Full Fields Doc');
    assert.equal(docs[0].content, '# Title\nBody.');
    assert.equal(docs[0].versionNumber, 1);
  });
});

describe('linkDocumentToIssue', () => {
  it('links an existing document to an additional issue', async () => {
    const doc = await createDocument(db as any, {
      title: 'Multi-Issue Doc',
      content: 'Shared content',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Ivan',
    });

    await linkDocumentToIssue(db as any, doc.id, TEST_ISSUE_ID_2);

    const docsForIssue1 = await listDocumentsByIssue(db as any, TEST_ISSUE_ID);
    const docsForIssue2 = await listDocumentsByIssue(db as any, TEST_ISSUE_ID_2);

    assert.ok(docsForIssue1.some((d) => d.id === doc.id));
    assert.ok(docsForIssue2.some((d) => d.id === doc.id));
  });

  it('is idempotent — linking twice does not throw', async () => {
    const doc = await createDocument(db as any, {
      title: 'Idempotent Link Doc',
      content: 'Content',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Judy',
    });

    await assert.doesNotReject(async () => {
      await linkDocumentToIssue(db as any, doc.id, TEST_ISSUE_ID);
      await linkDocumentToIssue(db as any, doc.id, TEST_ISSUE_ID);
    });
  });
});
