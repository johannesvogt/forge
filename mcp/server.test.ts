import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pkg from 'pg';
const { Pool } = pkg;
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from './server.ts';
import { findActiveApiKey } from '../lib/auth/api-key-service.ts';
import { hashApiKey } from '../lib/auth/api-keys.ts';

const DB_URL = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/forge';
const pool = new Pool({ connectionString: DB_URL });

const TEST_PREFIX = `mcp-test-${crypto.randomUUID().slice(0, 8)}`;
const AGENT_LABEL = `${TEST_PREFIX}-agent`;

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
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const entries = Object.entries(data).filter(([, v]) => v !== undefined);
        const fields = entries.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
        const values = entries.map(([, v]) => v);
        const r = await pool.query(
          `UPDATE "Issue" SET ${fields} WHERE id = $1 RETURNING *`,
          [where.id, ...values]
        );
        return r.rows[0];
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
    apiKey: {
      findUnique: async ({ where }: { where: { keyHash: string } }) => {
        const r = await pool.query(`SELECT * FROM "ApiKey" WHERE "keyHash" = $1`, [where.keyHash]);
        return r.rows[0] ?? null;
      },
    },
  };
}

type DbClient = ReturnType<typeof makePgClient>;
let db: DbClient;
let client: Client;

async function makeClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(db, AGENT_LABEL);
  await server.connect(serverTransport);
  const c = new Client({ name: 'test-client', version: '1.0.0' }, {});
  await c.connect(clientTransport);
  return c;
}

before(async () => {
  db = makePgClient(pool);
  client = await makeClient();
});

after(async () => {
  await pool.query(`DELETE FROM "Issue" WHERE title LIKE $1`, [`${TEST_PREFIX}%`]);
  await pool.query(`DELETE FROM "Comment" WHERE "targetId" LIKE $1 OR "authorLabel" = $2`, [`${TEST_PREFIX}%`, AGENT_LABEL]);
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
      `INSERT INTO "Issue" (id, title, description, "column", "createdAt", "updatedAt") VALUES ($1,$2,'',$3,NOW(),NOW())`,
      [crypto.randomUUID(), `${TEST_PREFIX}-todo-issue`, 'TODO']
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
      arguments: { title: `${TEST_PREFIX}-move-1` },
    });
    const { id } = parseText(created) as { id: string };
    const result = await client.callTool({
      name: 'move_issue',
      arguments: { id, column: 'TODO' },
    });
    const issue = parseText(result) as { column: string };
    assert.equal(issue.column, 'TODO');
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

  it('returns empty array for target with no comments', async () => {
    const result = await client.callTool({
      name: 'list_comments',
      arguments: { target_type: 'issue', target_id: `${TEST_PREFIX}-nonexistent` },
    });
    const comments = parseText(result);
    assert.deepEqual(comments, []);
  });
});

describe('auth: findActiveApiKey', () => {
  let rawKey: string;
  let userId: string;

  before(async () => {
    userId = crypto.randomUUID();
    rawKey = `frg_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = hashApiKey(rawKey);
    await pool.query(
      `INSERT INTO "User" (id, email, "passwordHash", "createdAt", "updatedAt") VALUES ($1,$2,$3,NOW(),NOW()) ON CONFLICT DO NOTHING`,
      [userId, `${TEST_PREFIX}@test.invalid`, 'hash']
    );
    await pool.query(
      `INSERT INTO "ApiKey" (id, "userId", label, "keyHash", last4, "createdAt") VALUES ($1,$2,$3,$4,$5,NOW())`,
      [crypto.randomUUID(), userId, AGENT_LABEL, keyHash, rawKey.slice(-4)]
    );
  });

  after(async () => {
    await pool.query(`DELETE FROM "ApiKey" WHERE "userId" = $1`, [userId]);
    await pool.query(`DELETE FROM "User" WHERE id = $1`, [userId]);
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
