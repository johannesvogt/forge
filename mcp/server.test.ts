import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestPool, type TestPool } from '../lib/test-support/db.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from './server.ts';
import { findActiveApiKey } from '../lib/auth/api-key-service.ts';
import { hashApiKey } from '../lib/auth/api-keys.ts';

const pool = createTestPool();

const TEST_PREFIX = `mcp-test-${crypto.randomUUID().slice(0, 8)}`;
const AGENT_LABEL = `${TEST_PREFIX}-agent`;

const TEST_DOC_ISSUE_ID = `${TEST_PREFIX}-doc-issue`;

let testUserId: string;
let testProjectId: string;

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
      update: async ({ where, data }: { where: { id: string; projectId?: string }; data: Record<string, unknown> }) => {
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
    },
    issueDependency: {
      findMany: async ({ where }: { where: { dependentId?: string; dependsOnId?: string } }) => {
        const field = where.dependentId !== undefined ? 'dependentId' : 'dependsOnId';
        const value = where.dependentId ?? where.dependsOnId;
        const r = await pool.query(`SELECT * FROM "IssueDependency" WHERE "${field}" = $1`, [value]);
        return r.rows;
      },
    },
    comment: {
      create: async ({ data }: {
        data: {
          targetType: string; targetId: string; body: string;
          authorUserId?: string | null; authorLabel: string; status?: string;
          anchorStart?: number | null; anchorEnd?: number | null; anchorFilePath?: string | null;
        };
      }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "Comment" (id,"targetType","targetId",body,"authorUserId","authorLabel",status,"createdAt","anchorStart","anchorEnd","anchorFilePath")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [id, data.targetType, data.targetId, data.body, data.authorUserId ?? null,
           data.authorLabel, data.status ?? 'open', now,
           data.anchorStart ?? null, data.anchorEnd ?? null, data.anchorFilePath ?? null]
        );
        return r.rows[0];
      },
      findMany: async ({ where, orderBy }: {
        where: { targetType: string; targetId: string; anchorStart?: number | null; anchorEnd?: number | null; anchorFilePath?: string | null };
        orderBy: { createdAt: 'asc' | 'desc' };
      }) => {
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
      update: async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        const r = await pool.query(
          `UPDATE "Comment" SET status = $1 WHERE id = $2 RETURNING *`,
          [data.status, where.id]
        );
        return r.rows[0];
      },
    },
    diff: {
      create: async ({
        data,
      }: {
        data: {
          title: string;
          description: string;
          branch: string;
          diffText: string;
          issueId: string;
          projectId: string;
          authorUserId?: string | null;
          authorLabel: string;
        };
      }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "Diff" (id, title, description, branch, "diffText", "issueId", "projectId", "authorUserId", "authorLabel", "createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [id, data.title, data.description, data.branch, data.diffText, data.issueId,
           data.projectId, data.authorUserId ?? null, data.authorLabel, now]
        );
        return r.rows[0];
      },
      findUnique: async ({ where }: { where: { id: string; projectId?: string } }) => {
        let q = `SELECT * FROM "Diff" WHERE id = $1`;
        const params: unknown[] = [where.id];
        if (where.projectId) {
          params.push(where.projectId);
          q += ` AND "projectId" = $${params.length}`;
        }
        const r = await pool.query(q, params);
        return r.rows[0] ?? null;
      },
      findMany: async ({
        where,
        orderBy,
      }: {
        where: { issueId: string; projectId?: string };
        orderBy: { createdAt: 'asc' | 'desc' };
      }) => {
        const dir = orderBy.createdAt === 'desc' ? 'DESC' : 'ASC';
        const conditions = [`"issueId" = $1`];
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
    apiKey: {
      findUnique: async ({ where }: { where: { keyHash: string } }) => {
        const r = await pool.query(`SELECT * FROM "ApiKey" WHERE "keyHash" = $1`, [where.keyHash]);
        return r.rows[0] ?? null;
      },
    },
    skill: {
      create: async ({ data }: { data: { name: string; description: string; prompt: string; projectId: string } }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "Skill" (id, name, description, prompt, "projectId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING *`,
          [id, data.name, data.description, data.prompt, data.projectId, now]
        );
        return r.rows[0];
      },
      findUnique: async ({ where }: { where: { id?: string; projectId_name?: { projectId: string; name: string } } }) => {
        if (where.projectId_name) {
          const r = await pool.query(
            `SELECT * FROM "Skill" WHERE "projectId" = $1 AND name = $2`,
            [where.projectId_name.projectId, where.projectId_name.name]
          );
          return r.rows[0] ?? null;
        }
        if (where.id) {
          const r = await pool.query(`SELECT * FROM "Skill" WHERE id = $1`, [where.id]);
          return r.rows[0] ?? null;
        }
        return null;
      },
      findMany: async ({ where }: { where?: { projectId?: string } } = {}) => {
        if (where?.projectId) {
          const r = await pool.query(`SELECT * FROM "Skill" WHERE "projectId" = $1 ORDER BY name ASC`, [where.projectId]);
          return r.rows;
        }
        const r = await pool.query(`SELECT * FROM "Skill" ORDER BY name ASC`);
        return r.rows;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const entries = Object.entries(data).filter(([, v]) => v !== undefined);
        const fields = entries.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
        const values = entries.map(([, v]) => v);
        const r = await pool.query(
          `UPDATE "Skill" SET ${fields} WHERE id = $1 RETURNING *`,
          [where.id, ...values]
        );
        return r.rows[0];
      },
      delete: async ({ where }: { where: { id: string } }) => {
        await pool.query(`DELETE FROM "Skill" WHERE id = $1`, [where.id]);
      },
    },
    skillFile: {
      create: async ({ data }: { data: { skillId: string; name: string; content: string } }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "SkillFile" (id, "skillId", name, content, "createdAt") VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [id, data.skillId, data.name, data.content, now]
        );
        return r.rows[0];
      },
      findMany: async ({ where }: { where: { skillId: string } }) => {
        const r = await pool.query(
          `SELECT * FROM "SkillFile" WHERE "skillId" = $1 ORDER BY name ASC`,
          [where.skillId]
        );
        return r.rows;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        await pool.query(`DELETE FROM "SkillFile" WHERE id = $1`, [where.id]);
      },
    },
    projectContext: {
      upsert: async ({
        where,
        create,
      }: {
        where: { projectId: string };
        create: { projectId: string; content: string; authorLabel: string; authorUserId: string | null };
        update: { content: string; authorLabel: string; authorUserId: string | null; updatedAt: Date };
      }) => {
        const id = crypto.randomUUID();
        const r = await pool.query(
          `INSERT INTO "ProjectContext" (id, "projectId", content, "authorLabel", "authorUserId", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT ("projectId") DO UPDATE SET
             content = $3,
             "authorLabel" = $4,
             "authorUserId" = $5,
             "updatedAt" = NOW()
           RETURNING *`,
          [id, create.projectId, create.content, create.authorLabel, create.authorUserId]
        );
        return r.rows[0];
      },
      findUnique: async ({ where }: { where: { projectId: string } }) => {
        const r = await pool.query(`SELECT * FROM "ProjectContext" WHERE "projectId" = $1`, [where.projectId]);
        return r.rows[0] ?? null;
      },
    },
  };
}

type DbClient = ReturnType<typeof makeDbClient>;
let db: DbClient;
let client: Client;

async function makeClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(db, AGENT_LABEL, testProjectId);
  await server.connect(serverTransport);
  const c = new Client({ name: 'test-client', version: '1.0.0' }, {});
  await c.connect(clientTransport);
  return c;
}

before(async () => {
  db = makeDbClient(pool);

  const userId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO "User" (id, email, "passwordHash", "createdAt", "updatedAt") VALUES ($1,$2,$3,NOW(),NOW())`,
    [userId, `${TEST_PREFIX}@test.invalid`, 'hash']
  );
  testUserId = userId;

  const projectId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO "Project" (id, name, slug, "createdByUserId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,NOW(),NOW())`,
    [projectId, `MCP Test ${TEST_PREFIX}`, `mcp-${TEST_PREFIX}`, userId]
  );
  testProjectId = projectId;

  client = await makeClient();
});

after(async () => {
  await pool.query(`DELETE FROM "Comment" WHERE "targetId" LIKE $1 OR "authorLabel" = $2`, [`${TEST_PREFIX}%`, AGENT_LABEL]);
  await pool.query(`DELETE FROM "Project" WHERE id = $1`, [testProjectId]);
  await pool.query(`DELETE FROM "User" WHERE id = $1`, [testUserId]);
  await pool.end();
});

function parseText(result: unknown): unknown {
  const r = result as { content: Array<{ type: string; text: string }> };
  return JSON.parse(r.content[0].text);
}

describe('list_issues', () => {
  it('returns all issues as array', async () => {
    const result = await client.callTool({ name: 'list_issues', arguments: {} });
    const issues = parseText(result);
    assert.ok(Array.isArray(issues));
  });

  it('filters by column', async () => {
    await pool.query(
      `INSERT INTO "Issue" (id, "key", title, description, "column", "projectId", "createdAt", "updatedAt") VALUES ($1,$2,$3,'',$4,$5,NOW(),NOW())`,
      [crypto.randomUUID(), `MCPT-${Date.now()}`, `${TEST_PREFIX}-todo-issue`, 'TODO', testProjectId]
    );
    const result = await client.callTool({ name: 'list_issues', arguments: { column: 'TODO' } });
    const issues = parseText(result) as Array<{ column: string }>;
    assert.ok(Array.isArray(issues));
    assert.ok(issues.every((i) => i.column === 'TODO'));
  });
});

describe('create_issue', () => {
  it('creates an issue and returns it with id', async () => {
    const result = await client.callTool({
      name: 'create_issue',
      arguments: { title: `${TEST_PREFIX}-create-1`, description: 'test desc' },
    });
    const issue = parseText(result) as { id: string; title: string; column: string };
    assert.equal(issue.title, `${TEST_PREFIX}-create-1`);
    assert.equal(issue.column, 'BACKLOG');
    assert.ok(issue.id.length > 0);
  });

  it('creates an issue in a specified column', async () => {
    const result = await client.callTool({
      name: 'create_issue',
      arguments: { title: `${TEST_PREFIX}-create-2`, column: 'TODO' },
    });
    const issue = parseText(result) as { column: string };
    assert.equal(issue.column, 'TODO');
  });
});

describe('get_issue', () => {
  it('returns the issue by id', async () => {
    const created = await client.callTool({
      name: 'create_issue',
      arguments: { title: `${TEST_PREFIX}-get-1` },
    });
    const { id } = parseText(created) as { id: string };
    const result = await client.callTool({ name: 'get_issue', arguments: { id } });
    const issue = parseText(result) as { id: string; title: string };
    assert.equal(issue.id, id);
    assert.equal(issue.title, `${TEST_PREFIX}-get-1`);
  });

  it('returns isError for unknown id', async () => {
    const result = await client.callTool({ name: 'get_issue', arguments: { id: 'nonexistent-id-999' } });
    assert.equal((result as { isError?: boolean }).isError, true);
  });
});

describe('update_issue', () => {
  it('updates title and description', async () => {
    const created = await client.callTool({
      name: 'create_issue',
      arguments: { title: `${TEST_PREFIX}-update-1` },
    });
    const { id } = parseText(created) as { id: string };
    const result = await client.callTool({
      name: 'update_issue',
      arguments: { id, title: `${TEST_PREFIX}-update-1-new`, description: 'updated' },
    });
    const issue = parseText(result) as { title: string; description: string };
    assert.equal(issue.title, `${TEST_PREFIX}-update-1-new`);
    assert.equal(issue.description, 'updated');
  });
});

describe('move_issue', () => {
  it('moves issue to a valid next column', async () => {
    const created = await client.callTool({
      name: 'create_issue',
      arguments: { title: `${TEST_PREFIX}-move-1`, column: 'TODO' },
    });
    const { id } = parseText(created) as { id: string };
    const result = await client.callTool({
      name: 'move_issue',
      arguments: { id, column: 'IN_PROGRESS' },
    });
    const issue = parseText(result) as { column: string };
    assert.equal(issue.column, 'IN_PROGRESS');
  });

  it('returns isError for invalid transition', async () => {
    const created = await client.callTool({
      name: 'create_issue',
      arguments: { title: `${TEST_PREFIX}-move-2` },
    });
    const { id } = parseText(created) as { id: string };
    const result = await client.callTool({ name: 'move_issue', arguments: { id, column: 'DONE' } });
    assert.equal((result as { isError?: boolean }).isError, true);
  });
});

describe('add_comment', () => {
  it('adds a comment on an issue with agent as author', async () => {
    const created = await client.callTool({
      name: 'create_issue',
      arguments: { title: `${TEST_PREFIX}-comment-issue-1` },
    });
    const { id: issueId } = parseText(created) as { id: string };
    const result = await client.callTool({
      name: 'add_comment',
      arguments: { target_type: 'issue', target_id: issueId, body: 'Agent analysis done.' },
    });
    const comment = parseText(result) as { targetType: string; targetId: string; body: string; authorLabel: string; authorUserId: null };
    assert.equal(comment.targetType, 'issue');
    assert.equal(comment.targetId, issueId);
    assert.equal(comment.body, 'Agent analysis done.');
    assert.equal(comment.authorLabel, AGENT_LABEL);
    assert.equal(comment.authorUserId, null);
  });
});

describe('list_comments', () => {
  it('returns comments for a target', async () => {
    const created = await client.callTool({
      name: 'create_issue',
      arguments: { title: `${TEST_PREFIX}-list-comments-1` },
    });
    const { id: issueId } = parseText(created) as { id: string };
    await client.callTool({
      name: 'add_comment',
      arguments: { target_type: 'issue', target_id: issueId, body: 'First comment' },
    });
    await client.callTool({
      name: 'add_comment',
      arguments: { target_type: 'issue', target_id: issueId, body: 'Second comment' },
    });
    const result = await client.callTool({
      name: 'list_comments',
      arguments: { target_type: 'issue', target_id: issueId },
    });
    const comments = parseText(result) as Array<{ body: string }>;
    assert.ok(Array.isArray(comments));
    assert.equal(comments.length, 2);
    assert.equal(comments[0].body, 'First comment');
    assert.equal(comments[1].body, 'Second comment');
  });

  it('returns isError for an unknown issue', async () => {
    const result = await client.callTool({
      name: 'list_comments',
      arguments: { target_type: 'issue', target_id: `${TEST_PREFIX}-nonexistent` },
    });
    assert.equal((result as { isError?: boolean }).isError, true);
  });
});

describe('create_doc', () => {
  it('creates a document linked to an issue and returns id, title, content, versionNumber', async () => {
    const result = await client.callTool({
      name: 'create_doc',
      arguments: { title: `${TEST_PREFIX}-doc-create-1`, content: '# Hello\nContent.', issue_id: TEST_DOC_ISSUE_ID },
    });
    const doc = parseText(result) as { id: string; title: string; content: string; versionNumber: number; versionId: string };
    assert.equal(doc.title, `${TEST_PREFIX}-doc-create-1`);
    assert.equal(doc.content, '# Hello\nContent.');
    assert.equal(doc.versionNumber, 1);
    assert.ok(doc.id.length > 0);
    assert.ok(doc.versionId.length > 0);
  });
});

describe('get_doc', () => {
  it('returns latest document content when no version specified', async () => {
    const created = await client.callTool({
      name: 'create_doc',
      arguments: { title: `${TEST_PREFIX}-doc-get-1`, content: 'Initial content', issue_id: TEST_DOC_ISSUE_ID },
    });
    const { id } = parseText(created) as { id: string };

    const result = await client.callTool({ name: 'get_doc', arguments: { id } });
    const doc = parseText(result) as { id: string; content: string; versionNumber: number };
    assert.equal(doc.id, id);
    assert.equal(doc.content, 'Initial content');
    assert.equal(doc.versionNumber, 1);
  });

  it('returns specific version content when version is provided', async () => {
    const created = await client.callTool({
      name: 'create_doc',
      arguments: { title: `${TEST_PREFIX}-doc-get-2`, content: 'v1 content', issue_id: TEST_DOC_ISSUE_ID },
    });
    const { id } = parseText(created) as { id: string };
    await client.callTool({ name: 'update_doc', arguments: { id, content: 'v2 content' } });

    const result = await client.callTool({ name: 'get_doc', arguments: { id, version: 1 } });
    const doc = parseText(result) as { content: string; versionNumber: number };
    assert.equal(doc.content, 'v1 content');
    assert.equal(doc.versionNumber, 1);
  });

  it('returns isError for unknown document id', async () => {
    const result = await client.callTool({ name: 'get_doc', arguments: { id: 'nonexistent-doc-abc123' } });
    assert.equal((result as { isError?: boolean }).isError, true);
  });
});

describe('update_doc', () => {
  it('appends new version and returns updated content and version number', async () => {
    const created = await client.callTool({
      name: 'create_doc',
      arguments: { title: `${TEST_PREFIX}-doc-update-1`, content: 'original', issue_id: TEST_DOC_ISSUE_ID },
    });
    const { id } = parseText(created) as { id: string };

    const result = await client.callTool({ name: 'update_doc', arguments: { id, content: 'updated content' } });
    const doc = parseText(result) as { versionNumber: number; content: string };
    assert.equal(doc.versionNumber, 2);
    assert.equal(doc.content, 'updated content');
  });

  it('leaves prior version content unchanged after update', async () => {
    const created = await client.callTool({
      name: 'create_doc',
      arguments: { title: `${TEST_PREFIX}-doc-update-2`, content: 'v1 original', issue_id: TEST_DOC_ISSUE_ID },
    });
    const { id } = parseText(created) as { id: string };
    await client.callTool({ name: 'update_doc', arguments: { id, content: 'v2 new' } });

    const v1Result = await client.callTool({ name: 'get_doc', arguments: { id, version: 1 } });
    const v1 = parseText(v1Result) as { content: string; versionNumber: number };
    assert.equal(v1.content, 'v1 original');
    assert.equal(v1.versionNumber, 1);
  });
});

describe('list_docs', () => {
  it('returns all project documents when issue_id is omitted', async () => {
    const title = `${TEST_PREFIX}-standalone-doc`;
    await client.callTool({
      name: 'create_doc',
      arguments: { title, content: 'standalone content' },
    });

    const result = await client.callTool({ name: 'list_docs', arguments: {} });
    const docs = parseText(result) as Array<{ title: string; content: string }>;
    assert.ok(docs.some((doc) => doc.title === title && doc.content === 'standalone content'));
  });

  it('returns documents linked to an issue', async () => {
    const issueId = `${TEST_PREFIX}-list-docs-issue`;
    await client.callTool({
      name: 'create_doc',
      arguments: { title: `${TEST_PREFIX}-list-doc-A`, content: 'content A', issue_id: issueId },
    });
    await client.callTool({
      name: 'create_doc',
      arguments: { title: `${TEST_PREFIX}-list-doc-B`, content: 'content B', issue_id: issueId },
    });

    const result = await client.callTool({ name: 'list_docs', arguments: { issue_id: issueId } });
    const docs = parseText(result) as Array<{ title: string }>;
    assert.ok(Array.isArray(docs));
    assert.equal(docs.length, 2);
  });

  it('returns empty array when no docs linked to issue', async () => {
    const result = await client.callTool({
      name: 'list_docs',
      arguments: { issue_id: `${TEST_PREFIX}-no-docs-issue` },
    });
    const docs = parseText(result);
    assert.deepEqual(docs, []);
  });
});

describe('upload_diff', () => {
  it('creates a diff and returns id, title, branch, diffText, authorLabel', async () => {
    const result = await client.callTool({
      name: 'upload_diff',
      arguments: {
        title: `${TEST_PREFIX}-diff-1`,
        branch: 'feature/test',
        diff_text: '--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new',
        issue_id: `${TEST_PREFIX}-diff-issue`,
      },
    });
    const diff = parseText(result) as { id: string; title: string; branch: string; diffText: string; authorLabel: string };
    assert.equal(diff.title, `${TEST_PREFIX}-diff-1`);
    assert.equal(diff.branch, 'feature/test');
    assert.ok(diff.diffText.includes('foo.ts'));
    assert.equal(diff.authorLabel, AGENT_LABEL);
    assert.ok(diff.id.length > 0);
  });

  it('stores optional description', async () => {
    const result = await client.callTool({
      name: 'upload_diff',
      arguments: {
        title: `${TEST_PREFIX}-diff-desc`,
        description: 'A detailed diff',
        branch: 'main',
        diff_text: '--- a/bar.ts\n+++ b/bar.ts',
        issue_id: `${TEST_PREFIX}-diff-issue`,
      },
    });
    const diff = parseText(result) as { description: string };
    assert.equal(diff.description, 'A detailed diff');
  });
});

describe('get_diff', () => {
  it('returns diff with all fields by id', async () => {
    const uploaded = await client.callTool({
      name: 'upload_diff',
      arguments: {
        title: `${TEST_PREFIX}-diff-get-1`,
        branch: 'feature/get',
        diff_text: 'diff content here',
        issue_id: `${TEST_PREFIX}-diff-issue`,
      },
    });
    const { id } = parseText(uploaded) as { id: string };

    const result = await client.callTool({ name: 'get_diff', arguments: { id } });
    const diff = parseText(result) as { id: string; title: string; diffText: string };
    assert.equal(diff.id, id);
    assert.equal(diff.title, `${TEST_PREFIX}-diff-get-1`);
    assert.equal(diff.diffText, 'diff content here');
  });

  it('returns isError for unknown diff id', async () => {
    const result = await client.callTool({ name: 'get_diff', arguments: { id: 'nonexistent-diff-xyz' } });
    assert.equal((result as { isError?: boolean }).isError, true);
  });
});

describe('list_diffs', () => {
  it('returns diffs linked to an issue in chronological order', async () => {
    const issueId = `${TEST_PREFIX}-list-diffs-issue`;
    await client.callTool({
      name: 'upload_diff',
      arguments: { title: `${TEST_PREFIX}-list-diff-A`, branch: 'a', diff_text: 'diff A', issue_id: issueId },
    });
    await client.callTool({
      name: 'upload_diff',
      arguments: { title: `${TEST_PREFIX}-list-diff-B`, branch: 'b', diff_text: 'diff B', issue_id: issueId },
    });

    const result = await client.callTool({ name: 'list_diffs', arguments: { issue_id: issueId } });
    const diffs = parseText(result) as Array<{ title: string }>;
    assert.ok(Array.isArray(diffs));
    assert.equal(diffs.length, 2);
    assert.equal(diffs[0].title, `${TEST_PREFIX}-list-diff-A`);
    assert.equal(diffs[1].title, `${TEST_PREFIX}-list-diff-B`);
  });

  it('returns empty array when no diffs for issue', async () => {
    const result = await client.callTool({
      name: 'list_diffs',
      arguments: { issue_id: `${TEST_PREFIX}-no-diffs-issue` },
    });
    const diffs = parseText(result);
    assert.deepEqual(diffs, []);
  });

  it('does not return diffs from other issues', async () => {
    const issueA = `${TEST_PREFIX}-isolation-diff-issue-A`;
    const issueB = `${TEST_PREFIX}-isolation-diff-issue-B`;
    await client.callTool({
      name: 'upload_diff',
      arguments: { title: `${TEST_PREFIX}-isolation-diff`, branch: 'x', diff_text: 'x', issue_id: issueA },
    });

    const result = await client.callTool({ name: 'list_diffs', arguments: { issue_id: issueB } });
    const diffs = parseText(result) as Array<unknown>;
    assert.deepEqual(diffs, []);
  });
});

describe('add_comment and list_comments on diff lines', () => {
  it('adds a diff line comment with anchor and returns it', async () => {
    const uploaded = await client.callTool({
      name: 'upload_diff',
      arguments: {
        title: `${TEST_PREFIX}-diff-line-comment`,
        branch: 'feature/comments',
        diff_text: '--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new',
        issue_id: `${TEST_PREFIX}-diff-comment-issue`,
      },
    });
    const { id: diffId } = parseText(uploaded) as { id: string };

    const result = await client.callTool({
      name: 'add_comment',
      arguments: {
        target_type: 'diff_line',
        target_id: diffId,
        body: 'This line needs attention.',
        anchor: { file_path: 'foo.ts', line_number: 5 },
      },
    });
    const comment = parseText(result) as {
      targetType: string; targetId: string; body: string; anchorFilePath: string | null;
    };
    assert.equal(comment.targetType, 'diff_line');
    assert.equal(comment.targetId, diffId);
    assert.equal(comment.body, 'This line needs attention.');
    assert.equal(comment.anchorFilePath, 'foo.ts');
  });

  it('list_comments returns only comments for the specific anchor', async () => {
    const uploaded = await client.callTool({
      name: 'upload_diff',
      arguments: {
        title: `${TEST_PREFIX}-diff-anchor-filter`,
        branch: 'feature/anchor',
        diff_text: 'diff',
        issue_id: `${TEST_PREFIX}-diff-anchor-issue`,
      },
    });
    const { id: diffId } = parseText(uploaded) as { id: string };

    await client.callTool({
      name: 'add_comment',
      arguments: { target_type: 'diff_line', target_id: diffId, body: 'Line 3 comment', anchor: { file_path: 'main.ts', line_number: 3 } },
    });
    await client.callTool({
      name: 'add_comment',
      arguments: { target_type: 'diff_line', target_id: diffId, body: 'Line 7 comment', anchor: { file_path: 'main.ts', line_number: 7 } },
    });

    const result = await client.callTool({
      name: 'list_comments',
      arguments: {
        target_type: 'diff_line',
        target_id: diffId,
        anchor: { file_path: 'main.ts', line_number: 3 },
      },
    });
    const comments = parseText(result) as Array<{ body: string }>;
    assert.ok(Array.isArray(comments));
    assert.equal(comments.length, 1);
    assert.equal(comments[0].body, 'Line 3 comment');
  });

  it('comments from a second diff do not appear on the first diff', async () => {
    const issueId = `${TEST_PREFIX}-diff-isolation-issue`;
    const diff1Result = await client.callTool({
      name: 'upload_diff',
      arguments: { title: `${TEST_PREFIX}-diff-iso-1`, branch: 'x', diff_text: 'x', issue_id: issueId },
    });
    const diff2Result = await client.callTool({
      name: 'upload_diff',
      arguments: { title: `${TEST_PREFIX}-diff-iso-2`, branch: 'y', diff_text: 'y', issue_id: issueId },
    });
    const { id: diff1Id } = parseText(diff1Result) as { id: string };
    const { id: diff2Id } = parseText(diff2Result) as { id: string };

    await client.callTool({
      name: 'add_comment',
      arguments: { target_type: 'diff_line', target_id: diff2Id, body: 'Belongs to diff2', anchor: { file_path: 'a.ts', line_number: 1 } },
    });

    const result = await client.callTool({
      name: 'list_comments',
      arguments: { target_type: 'diff_line', target_id: diff1Id },
    });
    const comments = parseText(result) as Array<unknown>;
    assert.deepEqual(comments, []);
  });
});

describe('auth: findActiveApiKey', () => {
  let rawKey: string;
  let authUserId: string;
  let authProjectId: string;

  before(async () => {
    authUserId = crypto.randomUUID();
    rawKey = `frg_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = hashApiKey(rawKey);
    await pool.query(
      `INSERT INTO "User" (id, email, "passwordHash", "createdAt", "updatedAt") VALUES ($1,$2,$3,NOW(),NOW()) ON CONFLICT DO NOTHING`,
      [authUserId, `${TEST_PREFIX}-auth@test.invalid`, 'hash']
    );
    authProjectId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO "Project" (id, name, slug, "createdByUserId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,NOW(),NOW())`,
      [authProjectId, `Auth Test ${TEST_PREFIX}`, `auth-${TEST_PREFIX}`, authUserId]
    );
    await pool.query(
      `INSERT INTO "ApiKey" (id, "userId", "projectId", label, "keyHash", last4, "createdAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [crypto.randomUUID(), authUserId, authProjectId, AGENT_LABEL, keyHash, rawKey.slice(-4)]
    );
  });

  after(async () => {
    await pool.query(`DELETE FROM "Project" WHERE id = $1`, [authProjectId]);
    await pool.query(`DELETE FROM "User" WHERE id = $1`, [authUserId]);
  });

  it('returns agent identity for a valid key', async () => {
    const agent = await findActiveApiKey(db as any, rawKey);
    assert.ok(agent !== null);
    assert.equal(agent.label, AGENT_LABEL);
  });

  it('returns null for an invalid key', async () => {
    const agent = await findActiveApiKey(db as any, 'frg_invalid_key_00000000000000000000000000000000');
    assert.equal(agent, null);
  });

  it('returns null for missing key (empty string)', async () => {
    const agent = await findActiveApiKey(db as any, '');
    assert.equal(agent, null);
  });
});

describe('list_skills', () => {
  before(async () => {
    await pool.query(
      `INSERT INTO "Skill" (id, name, description, prompt, "projectId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
      [crypto.randomUUID(), `${TEST_PREFIX}-skill-alpha`, 'Alpha desc', '# Alpha', testProjectId]
    );
    await pool.query(
      `INSERT INTO "Skill" (id, name, description, prompt, "projectId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
      [crypto.randomUUID(), `${TEST_PREFIX}-skill-beta`, 'Beta desc', '# Beta', testProjectId]
    );
  });

  it('returns all skills with name and description', async () => {
    const result = await client.callTool({ name: 'list_skills', arguments: {} });
    const skills = parseText(result) as Array<{ name: string; description: string }>;
    assert.ok(Array.isArray(skills));
    const names = skills.map((s) => s.name);
    assert.ok(names.includes(`${TEST_PREFIX}-skill-alpha`));
    assert.ok(names.includes(`${TEST_PREFIX}-skill-beta`));
    const alpha = skills.find((s) => s.name === `${TEST_PREFIX}-skill-alpha`);
    assert.equal(alpha?.description, 'Alpha desc');
  });

  it('does not include prompt in list_skills response', async () => {
    const result = await client.callTool({ name: 'list_skills', arguments: {} });
    const skills = parseText(result) as Array<Record<string, unknown>>;
    const alpha = skills.find((s) => s['name'] === `${TEST_PREFIX}-skill-alpha`);
    assert.ok(alpha !== undefined);
    assert.ok(!('prompt' in alpha));
  });
});

describe('get_skill', () => {
  let skillId: string;

  before(async () => {
    skillId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO "Skill" (id, name, description, prompt, "projectId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
      [skillId, `${TEST_PREFIX}-skill-with-files`, 'Skill with files', '# Main prompt', testProjectId]
    );
    await pool.query(
      `INSERT INTO "SkillFile" (id, "skillId", name, content, "createdAt") VALUES ($1,$2,$3,$4,NOW())`,
      [crypto.randomUUID(), skillId, 'TEMPLATE.md', '# Template content']
    );
  });

  it('returns skill primary prompt and supporting files', async () => {
    const result = await client.callTool({
      name: 'get_skill',
      arguments: { name: `${TEST_PREFIX}-skill-with-files` },
    });
    const data = parseText(result) as { skill: { name: string; prompt: string }; files: Array<{ name: string; content: string }> };
    assert.equal(data.skill.name, `${TEST_PREFIX}-skill-with-files`);
    assert.equal(data.skill.prompt, '# Main prompt');
    assert.equal(data.files.length, 1);
    assert.equal(data.files[0].name, 'TEMPLATE.md');
    assert.equal(data.files[0].content, '# Template content');
  });

  it('returns skill with empty files array when no supporting files', async () => {
    await pool.query(
      `INSERT INTO "Skill" (id, name, description, prompt, "projectId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
      [crypto.randomUUID(), `${TEST_PREFIX}-skill-no-files`, 'No files', '# Solo prompt', testProjectId]
    );
    const result = await client.callTool({
      name: 'get_skill',
      arguments: { name: `${TEST_PREFIX}-skill-no-files` },
    });
    const data = parseText(result) as { skill: { name: string }; files: unknown[] };
    assert.equal(data.skill.name, `${TEST_PREFIX}-skill-no-files`);
    assert.deepEqual(data.files, []);
  });

  it('returns isError for unknown skill name', async () => {
    const result = await client.callTool({
      name: 'get_skill',
      arguments: { name: `${TEST_PREFIX}-skill-ghost` },
    });
    assert.equal((result as { isError?: boolean }).isError, true);
  });
});

describe('get_project_context', () => {
  before(async () => {
    await pool.query(`DELETE FROM "ProjectContext" WHERE "projectId" = $1`, [testProjectId]);
  });

  after(async () => {
    await pool.query(`DELETE FROM "ProjectContext" WHERE "projectId" = $1`, [testProjectId]);
  });

  it('returns empty string when no context has been set', async () => {
    const result = await client.callTool({ name: 'get_project_context', arguments: {} });
    const r = result as { content: Array<{ type: string; text: string }> };
    assert.equal(r.content[0].text, '');
  });

  it('returns content after update_project_context is called', async () => {
    await client.callTool({
      name: 'update_project_context',
      arguments: { content: '# My Project\nAgent orientation.' },
    });
    const result = await client.callTool({ name: 'get_project_context', arguments: {} });
    const r = result as { content: Array<{ type: string; text: string }> };
    assert.equal(r.content[0].text, '# My Project\nAgent orientation.');
  });
});

describe('update_project_context', () => {
  before(async () => {
    await pool.query(`DELETE FROM "ProjectContext" WHERE "projectId" = $1`, [testProjectId]);
  });

  after(async () => {
    await pool.query(`DELETE FROM "ProjectContext" WHERE "projectId" = $1`, [testProjectId]);
  });

  it('saves content and returns authorLabel', async () => {
    const result = await client.callTool({
      name: 'update_project_context',
      arguments: { content: '# Context\nSome details.' },
    });
    const data = parseText(result) as { id: string; authorLabel: string };
    assert.equal(data.authorLabel, AGENT_LABEL);
  });

  it('replaces existing content on second call', async () => {
    await client.callTool({
      name: 'update_project_context',
      arguments: { content: 'First write' },
    });
    await client.callTool({
      name: 'update_project_context',
      arguments: { content: 'Second write' },
    });
    const result = await client.callTool({ name: 'get_project_context', arguments: {} });
    const r = result as { content: Array<{ type: string; text: string }> };
    assert.equal(r.content[0].text, 'Second write');
  });

  it('returns no warning for content within token limit', async () => {
    const result = await client.callTool({
      name: 'update_project_context',
      arguments: { content: 'Short content.' },
    });
    const data = parseText(result) as { warning?: string };
    assert.equal(data.warning, undefined);
  });

  it('returns a warning when content exceeds 1000 tokens', async () => {
    const bigContent = 'x'.repeat(4001);
    const result = await client.callTool({
      name: 'update_project_context',
      arguments: { content: bigContent },
    });
    const data = parseText(result) as { warning?: string };
    assert.ok(data.warning !== undefined, 'expected a warning');
    assert.ok(data.warning!.includes('1000 tokens'));
  });
});

describe('cross-project isolation', () => {
  let projectBId: string;
  let clientB: Client;

  before(async () => {
    projectBId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO "Project" (id, name, slug, "createdByUserId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,NOW(),NOW())`,
      [projectBId, `MCP Test B ${TEST_PREFIX}`, `mcp-b-${TEST_PREFIX}`, testUserId]
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverB = createMcpServer(db, AGENT_LABEL, projectBId);
    await serverB.connect(serverTransport);
    clientB = new Client({ name: 'test-client-b', version: '1.0.0' }, {});
    await clientB.connect(clientTransport);
  });

  after(async () => {
    await pool.query(`DELETE FROM "Project" WHERE id = $1`, [projectBId]);
  });

  it('list_issues on server A does not return issues created via server B', async () => {
    const createResult = await clientB.callTool({
      name: 'create_issue',
      arguments: { title: `${TEST_PREFIX}-cross-project-issue` },
    });
    const created = parseText(createResult) as { id: string };

    const listA = await client.callTool({ name: 'list_issues', arguments: {} });
    const issuesA = parseText(listA) as Array<{ id: string }>;
    assert.ok(!issuesA.some((i) => i.id === created.id), 'project A server must not see project B issue');

    const listB = await clientB.callTool({ name: 'list_issues', arguments: {} });
    const issuesB = parseText(listB) as Array<{ id: string }>;
    assert.ok(issuesB.some((i) => i.id === created.id), 'project B server must see its own issue');
  });
});
