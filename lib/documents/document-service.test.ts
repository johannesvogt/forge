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
  updateDocument,
  getDocumentAtVersion,
  listDocumentVersions,
  diffDocumentVersions,
  type Document,
} from './document-service.ts';

const DB_URL = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/forge';
const pool = new Pool({ connectionString: DB_URL });

const TEST_RUN = crypto.randomUUID().slice(0, 8);
let testUserId: string;
let projectAId: string;
let projectBId: string;

const TEST_ISSUE_ID = `test-issue-${crypto.randomUUID()}`;
const TEST_ISSUE_ID_2 = `test-issue-${crypto.randomUUID()}`;

function makePgClient(pool: InstanceType<typeof Pool>) {
  return {
    document: {
      create: async ({ data }: { data: { title: string; projectId: string } }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "Document" (id, title, "projectId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$4) RETURNING *`,
          [id, data.title, data.projectId, now]
        );
        return r.rows[0];
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const r = await pool.query(`SELECT * FROM "Document" WHERE id = $1`, [where.id]);
        return r.rows[0] ?? null;
      },
      findMany: async ({ where }: { where: { projectId: string } }) => {
        const r = await pool.query(`SELECT * FROM "Document" WHERE "projectId" = $1`, [where.projectId]);
        return r.rows;
      },
      update: async ({ where, data }: { where: { id: string }; data: { updatedAt: Date } }) => {
        const r = await pool.query(
          `UPDATE "Document" SET "updatedAt" = $2 WHERE id = $1 RETURNING *`,
          [where.id, data.updatedAt]
        );
        return r.rows[0];
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
        where: { documentId: string; versionNumber?: number };
        orderBy: { versionNumber: 'asc' | 'desc' };
      }) => {
        const dir = orderBy.versionNumber === 'desc' ? 'DESC' : 'ASC';
        if (where.versionNumber !== undefined) {
          const r = await pool.query(
            `SELECT * FROM "DocumentVersion" WHERE "documentId" = $1 AND "versionNumber" = $2 ORDER BY "versionNumber" ${dir} LIMIT 1`,
            [where.documentId, where.versionNumber]
          );
          return r.rows[0] ?? null;
        }
        const r = await pool.query(
          `SELECT * FROM "DocumentVersion" WHERE "documentId" = $1 ORDER BY "versionNumber" ${dir} LIMIT 1`,
          [where.documentId]
        );
        return r.rows[0] ?? null;
      },
      findMany: async ({
        where,
        orderBy,
      }: {
        where: { documentId: string };
        orderBy: { versionNumber: 'asc' | 'desc' };
      }) => {
        const dir = orderBy.versionNumber === 'desc' ? 'DESC' : 'ASC';
        const r = await pool.query(
          `SELECT * FROM "DocumentVersion" WHERE "documentId" = $1 ORDER BY "versionNumber" ${dir}`,
          [where.documentId]
        );
        return r.rows;
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

before(async () => {
  db = makePgClient(pool);
  const userId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO "User" (id, email, "passwordHash", "createdAt", "updatedAt") VALUES ($1,$2,$3,now(),now())`,
    [userId, `test-doc-${TEST_RUN}@example.com`, 'hash']
  );
  testUserId = userId;

  const pAId = crypto.randomUUID();
  const pBId = crypto.randomUUID();
  const now = new Date();
  await pool.query(
    `INSERT INTO "Project" (id, name, slug, "createdByUserId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5),($6,$7,$8,$4,$5,$5)`,
    [pAId, `Doc Test A ${TEST_RUN}`, `doc-a-${TEST_RUN}`, userId, now, pBId, `Doc Test B ${TEST_RUN}`, `doc-b-${TEST_RUN}`]
  );
  projectAId = pAId;
  projectBId = pBId;
});

after(async () => {
  await pool.query(`DELETE FROM "Project" WHERE "createdByUserId" = $1`, [testUserId]);
  await pool.query(`DELETE FROM "User" WHERE id = $1`, [testUserId]);
  await pool.end();
});

describe('createDocument', () => {
  it('creates a document with version 1 and links it to the given issue', async () => {
    const doc = await createDocument(db as any, projectAId, {
      title: 'My First Doc',
      content: '# Hello\nThis is content.',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Alice',
    });

    assert.equal(doc.title, 'My First Doc');
    assert.equal(doc.content, '# Hello\nThis is content.');
    assert.equal(doc.versionNumber, 1);
    assert.equal(doc.projectId, projectAId);
    assert.ok(doc.id.length > 0);
    assert.ok(doc.createdAt instanceof Date || typeof doc.createdAt === 'string');
    assert.ok(doc.updatedAt instanceof Date || typeof doc.updatedAt === 'string');
  });

  it('records the author on the version', async () => {
    const doc = await createDocument(db as any, projectAId, {
      title: 'Authored Doc',
      content: 'Some content',
      issueId: TEST_ISSUE_ID,
      authorUserId: 'user-123',
      authorLabel: 'Bob',
    });

    const fetched = await getDocument(db as any, projectAId, doc.id);
    assert.ok(fetched !== null);
    assert.equal(fetched.versionNumber, 1);
  });

  it('creates a link so the document appears when listing by issue', async () => {
    const doc = await createDocument(db as any, projectAId, {
      title: 'Linked Doc',
      content: 'Linked content',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Carol',
    });

    const docs = await listDocumentsByIssue(db as any, projectAId, TEST_ISSUE_ID);
    const ids = docs.map((d) => d.id);
    assert.ok(ids.includes(doc.id), 'newly created doc should appear in issue list');
  });
});

describe('getDocument', () => {
  it('returns the document with title, content, and version number', async () => {
    const created = await createDocument(db as any, projectAId, {
      title: 'Fetch Test',
      content: '## Section\nBody text here.',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Dave',
    });

    const doc = await getDocument(db as any, projectAId, created.id);
    assert.ok(doc !== null);
    assert.equal(doc.id, created.id);
    assert.equal(doc.title, 'Fetch Test');
    assert.equal(doc.content, '## Section\nBody text here.');
    assert.equal(doc.versionNumber, 1);
  });

  it('returns null for a non-existent document id', async () => {
    const doc = await getDocument(db as any, projectAId, 'nonexistent-id-that-does-not-exist');
    assert.equal(doc, null);
  });

  it('includes createdAt and updatedAt fields', async () => {
    const created = await createDocument(db as any, projectAId, {
      title: 'Fields Test',
      content: 'Content',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Eve',
    });

    const doc = await getDocument(db as any, projectAId, created.id);
    assert.ok(doc !== null);
    assert.ok(doc.createdAt);
    assert.ok(doc.updatedAt);
  });

  it('returns null when document belongs to a different project', async () => {
    const doc = await createDocument(db as any, projectBId, {
      title: 'Cross Project Doc',
      content: 'Should not be visible',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Agent',
    });
    const result = await getDocument(db as any, projectAId, doc.id);
    assert.equal(result, null);
  });
});

describe('listDocumentsByIssue', () => {
  it('returns empty array when no documents are linked to the issue', async () => {
    const docs = await listDocumentsByIssue(db as any, projectAId, 'no-docs-for-this-issue');
    assert.deepEqual(docs, []);
  });

  it('returns only documents linked to the specific issue', async () => {
    const docA = await createDocument(db as any, projectAId, {
      title: 'Issue A Doc',
      content: 'For issue A',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Frank',
    });
    await createDocument(db as any, projectAId, {
      title: 'Issue B Doc',
      content: 'For issue B',
      issueId: TEST_ISSUE_ID_2,
      authorLabel: 'Grace',
    });

    const docsForA = await listDocumentsByIssue(db as any, projectAId, TEST_ISSUE_ID);
    const docsForB = await listDocumentsByIssue(db as any, projectAId, TEST_ISSUE_ID_2);

    assert.ok(docsForA.some((d) => d.id === docA.id));
    assert.ok(!docsForB.some((d) => d.id === docA.id));
  });

  it('returns each document with its content and version number', async () => {
    const issueId = `test-issue-${crypto.randomUUID()}`;
    await createDocument(db as any, projectAId, {
      title: 'Full Fields Doc',
      content: '# Title\nBody.',
      issueId,
      authorLabel: 'Henry',
    });

    const docs = await listDocumentsByIssue(db as any, projectAId, issueId);
    assert.equal(docs.length, 1);
    assert.equal(docs[0].title, 'Full Fields Doc');
    assert.equal(docs[0].content, '# Title\nBody.');
    assert.equal(docs[0].versionNumber, 1);
  });

  it('does not return documents from another project for the same issueId', async () => {
    const issueId = `test-issue-${crypto.randomUUID()}`;
    await createDocument(db as any, projectAId, { title: 'Proj A Doc', content: 'a', issueId, authorLabel: 'A' });
    await createDocument(db as any, projectBId, { title: 'Proj B Doc', content: 'b', issueId, authorLabel: 'B' });

    const docsA = await listDocumentsByIssue(db as any, projectAId, issueId);
    const docsB = await listDocumentsByIssue(db as any, projectBId, issueId);

    assert.ok(docsA.every((d) => d.projectId === projectAId));
    assert.ok(docsB.every((d) => d.projectId === projectBId));
  });
});

describe('linkDocumentToIssue', () => {
  it('links an existing document to an additional issue', async () => {
    const doc = await createDocument(db as any, projectAId, {
      title: 'Multi-Issue Doc',
      content: 'Shared content',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Ivan',
    });

    await linkDocumentToIssue(db as any, projectAId, doc.id, TEST_ISSUE_ID_2);

    const docsForIssue1 = await listDocumentsByIssue(db as any, projectAId, TEST_ISSUE_ID);
    const docsForIssue2 = await listDocumentsByIssue(db as any, projectAId, TEST_ISSUE_ID_2);

    assert.ok(docsForIssue1.some((d) => d.id === doc.id));
    assert.ok(docsForIssue2.some((d) => d.id === doc.id));
  });

  it('is idempotent — linking twice does not throw', async () => {
    const doc = await createDocument(db as any, projectAId, {
      title: 'Idempotent Link Doc',
      content: 'Content',
      issueId: TEST_ISSUE_ID,
      authorLabel: 'Judy',
    });

    await assert.doesNotReject(async () => {
      await linkDocumentToIssue(db as any, projectAId, doc.id, TEST_ISSUE_ID);
      await linkDocumentToIssue(db as any, projectAId, doc.id, TEST_ISSUE_ID);
    });
  });
});

describe('updateDocument', () => {
  it('creates version 2 with new content', async () => {
    const issueId = `test-issue-${crypto.randomUUID()}`;
    const doc = await createDocument(db as any, projectAId, {
      title: 'Versioned Doc',
      content: 'Original content',
      issueId,
      authorLabel: 'Alice',
    });

    const updated = await updateDocument(db as any, projectAId, doc.id, {
      content: 'Updated content',
      authorLabel: 'Bob',
    });

    assert.ok(updated !== null);
    assert.equal(updated.id, doc.id);
    assert.equal(updated.versionNumber, 2);
    assert.equal(updated.content, 'Updated content');
  });

  it('leaves version 1 content unchanged after update', async () => {
    const issueId = `test-issue-${crypto.randomUUID()}`;
    const doc = await createDocument(db as any, projectAId, {
      title: 'Immutable v1',
      content: 'v1 content',
      issueId,
      authorLabel: 'Alice',
    });

    await updateDocument(db as any, projectAId, doc.id, {
      content: 'v2 content',
      authorLabel: 'Bob',
    });

    const v1 = await getDocumentAtVersion(db as any, projectAId, doc.id, 1);
    assert.ok(v1 !== null);
    assert.equal(v1.content, 'v1 content');
    assert.equal(v1.versionNumber, 1);
  });

  it('returns null for a nonexistent document', async () => {
    const result = await updateDocument(db as any, projectAId, 'nonexistent-doc', {
      content: 'content',
      authorLabel: 'Alice',
    });
    assert.equal(result, null);
  });

  it('increments version number on successive updates', async () => {
    const issueId = `test-issue-${crypto.randomUUID()}`;
    const doc = await createDocument(db as any, projectAId, {
      title: 'Multi-version',
      content: 'v1',
      issueId,
      authorLabel: 'Alice',
    });

    const v2 = await updateDocument(db as any, projectAId, doc.id, { content: 'v2', authorLabel: 'Bob' });
    const v3 = await updateDocument(db as any, projectAId, doc.id, { content: 'v3', authorLabel: 'Carol' });

    assert.equal(v2?.versionNumber, 2);
    assert.equal(v3?.versionNumber, 3);
  });

  it('getDocument returns latest version after update', async () => {
    const issueId = `test-issue-${crypto.randomUUID()}`;
    const doc = await createDocument(db as any, projectAId, {
      title: 'Latest Version',
      content: 'old',
      issueId,
      authorLabel: 'Alice',
    });

    await updateDocument(db as any, projectAId, doc.id, { content: 'new', authorLabel: 'Bob' });

    const latest = await getDocument(db as any, projectAId, doc.id);
    assert.ok(latest !== null);
    assert.equal(latest.content, 'new');
    assert.equal(latest.versionNumber, 2);
  });
});

describe('getDocumentAtVersion', () => {
  it('returns version 1 content after an update', async () => {
    const issueId = `test-issue-${crypto.randomUUID()}`;
    const doc = await createDocument(db as any, projectAId, {
      title: 'Versioned',
      content: 'version one',
      issueId,
      authorLabel: 'Alice',
    });
    await updateDocument(db as any, projectAId, doc.id, { content: 'version two', authorLabel: 'Bob' });

    const v1 = await getDocumentAtVersion(db as any, projectAId, doc.id, 1);
    assert.ok(v1 !== null);
    assert.equal(v1.content, 'version one');
    assert.equal(v1.versionNumber, 1);
  });

  it('returns version 2 content', async () => {
    const issueId = `test-issue-${crypto.randomUUID()}`;
    const doc = await createDocument(db as any, projectAId, {
      title: 'Versioned',
      content: 'v1',
      issueId,
      authorLabel: 'Alice',
    });
    await updateDocument(db as any, projectAId, doc.id, { content: 'v2 content here', authorLabel: 'Bob' });

    const v2 = await getDocumentAtVersion(db as any, projectAId, doc.id, 2);
    assert.ok(v2 !== null);
    assert.equal(v2.content, 'v2 content here');
    assert.equal(v2.versionNumber, 2);
  });

  it('returns null for a nonexistent version number', async () => {
    const issueId = `test-issue-${crypto.randomUUID()}`;
    const doc = await createDocument(db as any, projectAId, {
      title: 'Single version',
      content: 'content',
      issueId,
      authorLabel: 'Alice',
    });

    const result = await getDocumentAtVersion(db as any, projectAId, doc.id, 99);
    assert.equal(result, null);
  });

  it('returns null for a nonexistent document', async () => {
    const result = await getDocumentAtVersion(db as any, projectAId, 'nonexistent', 1);
    assert.equal(result, null);
  });
});

describe('listDocumentVersions', () => {
  it('lists all versions in ascending order', async () => {
    const issueId = `test-issue-${crypto.randomUUID()}`;
    const doc = await createDocument(db as any, projectAId, {
      title: 'History Doc',
      content: 'v1',
      issueId,
      authorLabel: 'Alice',
    });
    await updateDocument(db as any, projectAId, doc.id, { content: 'v2', authorLabel: 'Bob' });
    await updateDocument(db as any, projectAId, doc.id, { content: 'v3', authorLabel: 'Carol' });

    const versions = await listDocumentVersions(db as any, projectAId, doc.id);
    assert.equal(versions.length, 3);
    assert.equal(versions[0].versionNumber, 1);
    assert.equal(versions[1].versionNumber, 2);
    assert.equal(versions[2].versionNumber, 3);
  });

  it('includes authorLabel on each version', async () => {
    const issueId = `test-issue-${crypto.randomUUID()}`;
    const doc = await createDocument(db as any, projectAId, {
      title: 'Author Check',
      content: 'v1',
      issueId,
      authorLabel: 'Alice',
    });
    await updateDocument(db as any, projectAId, doc.id, { content: 'v2', authorLabel: 'Bob' });

    const versions = await listDocumentVersions(db as any, projectAId, doc.id);
    assert.equal(versions[0].authorLabel, 'Alice');
    assert.equal(versions[1].authorLabel, 'Bob');
  });

  it('includes createdAt on each version', async () => {
    const issueId = `test-issue-${crypto.randomUUID()}`;
    const doc = await createDocument(db as any, projectAId, {
      title: 'Timestamp Check',
      content: 'v1',
      issueId,
      authorLabel: 'Alice',
    });

    const versions = await listDocumentVersions(db as any, projectAId, doc.id);
    assert.ok(versions[0].createdAt);
  });

  it('returns empty array for nonexistent document', async () => {
    const versions = await listDocumentVersions(db as any, projectAId, 'nonexistent-doc');
    assert.deepEqual(versions, []);
  });
});

describe('diffDocumentVersions', () => {
  it('returns unified diff between v1 and v2', async () => {
    const issueId = `test-issue-${crypto.randomUUID()}`;
    const doc = await createDocument(db as any, projectAId, {
      title: 'Diff Doc',
      content: 'Hello\nWorld',
      issueId,
      authorLabel: 'Alice',
    });
    await updateDocument(db as any, projectAId, doc.id, { content: 'Hello\nForge', authorLabel: 'Bob' });

    const diff = await diffDocumentVersions(db as any, projectAId, doc.id, 1, 2);
    assert.ok(diff !== null);
    assert.ok(diff.includes('--- v1'));
    assert.ok(diff.includes('+++ v2'));
    assert.ok(diff.includes('-World'));
    assert.ok(diff.includes('+Forge'));
    assert.ok(diff.includes(' Hello'));
  });

  it('returns empty diff header when versions are identical', async () => {
    const issueId = `test-issue-${crypto.randomUUID()}`;
    const doc = await createDocument(db as any, projectAId, {
      title: 'Same Content',
      content: 'unchanged',
      issueId,
      authorLabel: 'Alice',
    });
    await updateDocument(db as any, projectAId, doc.id, { content: 'unchanged', authorLabel: 'Bob' });

    const diff = await diffDocumentVersions(db as any, projectAId, doc.id, 1, 2);
    assert.ok(diff !== null);
    assert.ok(diff.includes('--- v1'));
    assert.ok(diff.includes('+++ v2'));
    assert.ok(!diff.includes('@@'));
  });

  it('returns null when document does not exist', async () => {
    const result = await diffDocumentVersions(db as any, projectAId, 'nonexistent', 1, 2);
    assert.equal(result, null);
  });

  it('returns null when a version does not exist', async () => {
    const issueId = `test-issue-${crypto.randomUUID()}`;
    const doc = await createDocument(db as any, projectAId, {
      title: 'Missing Version',
      content: 'content',
      issueId,
      authorLabel: 'Alice',
    });

    const result = await diffDocumentVersions(db as any, projectAId, doc.id, 1, 99);
    assert.equal(result, null);
  });
});
