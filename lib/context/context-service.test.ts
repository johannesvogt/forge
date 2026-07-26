import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestPool, type TestPool } from '../test-support/db.ts';
import { getProjectContext, updateProjectContext, type ProjectContext } from './context-service.ts';

const pool = createTestPool();

const TEST_RUN = crypto.randomUUID().slice(0, 8);
let testUserId: string;
let projectAId: string;
let projectBId: string;

function makeDbClient(pool: TestPool) {
  return {
    projectContext: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { projectId: string };
        create: { projectId: string; content: string; authorLabel: string; authorUserId: string | null };
        update: { content: string; authorLabel: string; authorUserId: string | null; updatedAt: Date };
      }): Promise<ProjectContext> => {
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
      findUnique: async ({ where }: { where: { projectId: string } }): Promise<ProjectContext | null> => {
        const r = await pool.query(`SELECT * FROM "ProjectContext" WHERE "projectId" = $1`, [where.projectId]);
        return r.rows[0] ?? null;
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
    [userId, `test-ctx-${TEST_RUN}@example.com`, 'hash']
  );
  testUserId = userId;

  const pAId = crypto.randomUUID();
  const pBId = crypto.randomUUID();
  const now = new Date();
  await pool.query(
    `INSERT INTO "Project" (id, name, slug, "createdByUserId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5),($6,$7,$8,$4,$5,$5)`,
    [pAId, `Ctx Test A ${TEST_RUN}`, `ctx-a-${TEST_RUN}`, userId, now, pBId, `Ctx Test B ${TEST_RUN}`, `ctx-b-${TEST_RUN}`]
  );
  projectAId = pAId;
  projectBId = pBId;
});

after(async () => {
  await pool.query(`DELETE FROM "Project" WHERE "createdByUserId" = $1`, [testUserId]);
  await pool.query(`DELETE FROM "User" WHERE id = $1`, [testUserId]);
  await pool.end();
});

describe('getProjectContext', () => {
  it('returns null when no context exists for the project', async () => {
    const result = await getProjectContext(db as any, projectAId);
    assert.equal(result, null);
  });

  it('returns stored context after an update', async () => {
    await updateProjectContext(db as any, projectAId, { content: 'Hello world', authorLabel: 'test-agent' });
    const result = await getProjectContext(db as any, projectAId);
    assert.ok(result !== null);
    assert.equal(result.content, 'Hello world');
    assert.equal(result.authorLabel, 'test-agent');
    assert.equal(result.projectId, projectAId);
  });
});

describe('updateProjectContext', () => {
  it('creates context when none exists', async () => {
    const { context } = await updateProjectContext(db as any, projectBId, {
      content: '# Project\nSome context.',
      authorLabel: 'agent-001',
    });
    assert.equal(context.projectId, projectBId);
    assert.equal(context.content, '# Project\nSome context.');
    assert.equal(context.authorLabel, 'agent-001');
    assert.equal(context.authorUserId, null);
  });

  it('replaces existing context content for the same project', async () => {
    const freshProjectId = projectAId;
    await pool.query(`DELETE FROM "ProjectContext" WHERE "projectId" = $1`, [freshProjectId]);
    await updateProjectContext(db as any, freshProjectId, { content: 'First version', authorLabel: 'agent-a' });
    const { context } = await updateProjectContext(db as any, freshProjectId, { content: 'Second version', authorLabel: 'agent-b' });
    assert.equal(context.content, 'Second version');
    assert.equal(context.authorLabel, 'agent-b');
  });

  it('stores authorUserId when provided', async () => {
    const pid = projectAId;
    await pool.query(`DELETE FROM "ProjectContext" WHERE "projectId" = $1`, [pid]);
    const { context } = await updateProjectContext(db as any, pid, {
      content: 'Human edit',
      authorLabel: 'Alice',
      authorUserId: 'user-123',
    });
    assert.equal(context.authorUserId, 'user-123');
    assert.equal(context.authorLabel, 'Alice');
  });

  it('returns no warning for content within 1000 tokens', async () => {
    await pool.query(`DELETE FROM "ProjectContext" WHERE "projectId" = $1`, [projectAId]);
    const smallContent = 'Short context.';
    const { warning } = await updateProjectContext(db as any, projectAId, {
      content: smallContent,
      authorLabel: 'agent',
    });
    assert.equal(warning, undefined);
  });

  it('returns a warning when content exceeds 1000 tokens', async () => {
    await pool.query(`DELETE FROM "ProjectContext" WHERE "projectId" = $1`, [projectAId]);
    const largeContent = 'x'.repeat(4001);
    const { context, warning } = await updateProjectContext(db as any, projectAId, {
      content: largeContent,
      authorLabel: 'agent',
    });
    assert.ok(warning !== undefined, 'expected a warning');
    assert.ok(warning!.includes('1000 tokens'), `unexpected warning: ${warning}`);
    assert.equal(context.content, largeContent, 'content should still be saved');
  });

  it('updates updatedAt on second write', async () => {
    await pool.query(`DELETE FROM "ProjectContext" WHERE "projectId" = $1`, [projectAId]);
    await updateProjectContext(db as any, projectAId, { content: 'v1', authorLabel: 'agent' });
    const before = await getProjectContext(db as any, projectAId);
    await new Promise((r) => setTimeout(r, 10));
    await updateProjectContext(db as any, projectAId, { content: 'v2', authorLabel: 'agent' });
    const after = await getProjectContext(db as any, projectAId);
    assert.ok(after!.updatedAt >= before!.updatedAt);
  });

  it('does not affect context of another project', async () => {
    await pool.query(`DELETE FROM "ProjectContext" WHERE "projectId" = $1`, [projectAId]);
    await pool.query(`DELETE FROM "ProjectContext" WHERE "projectId" = $1`, [projectBId]);

    await updateProjectContext(db as any, projectAId, { content: 'Project A context', authorLabel: 'agent-a' });
    await updateProjectContext(db as any, projectBId, { content: 'Project B context', authorLabel: 'agent-b' });

    const ctxA = await getProjectContext(db as any, projectAId);
    const ctxB = await getProjectContext(db as any, projectBId);

    assert.ok(ctxA !== null);
    assert.ok(ctxB !== null);
    assert.equal(ctxA.content, 'Project A context');
    assert.equal(ctxB.content, 'Project B context');
    assert.equal(ctxA.projectId, projectAId);
    assert.equal(ctxB.projectId, projectBId);
  });
});
