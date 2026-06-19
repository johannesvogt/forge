import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pkg from 'pg';
const { Pool } = pkg;
import { getProjectContext, updateProjectContext, type ProjectContext } from './context-service.ts';

const DB_URL = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/forge';
const pool = new Pool({ connectionString: DB_URL });

function makePgClient(pool: InstanceType<typeof Pool>) {
  return {
    projectContext: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { id: string };
        create: { id: string; content: string; authorLabel: string; authorUserId: string | null };
        update: { content: string; authorLabel: string; authorUserId: string | null; updatedAt: Date };
      }): Promise<ProjectContext> => {
        const r = await pool.query(
          `INSERT INTO "ProjectContext" (id, content, "authorLabel", "authorUserId", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (id) DO UPDATE SET
             content = $2,
             "authorLabel" = $3,
             "authorUserId" = $4,
             "updatedAt" = NOW()
           RETURNING *`,
          [create.id, create.content, create.authorLabel, create.authorUserId]
        );
        return r.rows[0];
      },
      findUnique: async ({ where }: { where: { id: string } }): Promise<ProjectContext | null> => {
        const r = await pool.query(`SELECT * FROM "ProjectContext" WHERE id = $1`, [where.id]);
        return r.rows[0] ?? null;
      },
    },
  };
}

type DbClient = ReturnType<typeof makePgClient>;
let db: DbClient;

before(async () => {
  db = makePgClient(pool);
  await pool.query(`DELETE FROM "ProjectContext" WHERE id = 'singleton'`);
});

after(async () => {
  await pool.query(`DELETE FROM "ProjectContext" WHERE id = 'singleton'`);
  await pool.end();
});

describe('getProjectContext', () => {
  it('returns null when no context exists', async () => {
    const result = await getProjectContext(db);
    assert.equal(result, null);
  });

  it('returns stored context after an update', async () => {
    await updateProjectContext(db, { content: 'Hello world', authorLabel: 'test-agent' });
    const result = await getProjectContext(db);
    assert.ok(result !== null);
    assert.equal(result.content, 'Hello world');
    assert.equal(result.authorLabel, 'test-agent');
    await pool.query(`DELETE FROM "ProjectContext" WHERE id = 'singleton'`);
  });
});

describe('updateProjectContext', () => {
  it('creates context when none exists', async () => {
    const { context } = await updateProjectContext(db, {
      content: '# Project\nSome context.',
      authorLabel: 'agent-001',
    });
    assert.equal(context.id, 'singleton');
    assert.equal(context.content, '# Project\nSome context.');
    assert.equal(context.authorLabel, 'agent-001');
    assert.equal(context.authorUserId, null);
    await pool.query(`DELETE FROM "ProjectContext" WHERE id = 'singleton'`);
  });

  it('replaces existing context content', async () => {
    await updateProjectContext(db, { content: 'First version', authorLabel: 'agent-a' });
    const { context } = await updateProjectContext(db, { content: 'Second version', authorLabel: 'agent-b' });
    assert.equal(context.content, 'Second version');
    assert.equal(context.authorLabel, 'agent-b');
    await pool.query(`DELETE FROM "ProjectContext" WHERE id = 'singleton'`);
  });

  it('stores authorUserId when provided', async () => {
    const { context } = await updateProjectContext(db, {
      content: 'Human edit',
      authorLabel: 'Alice',
      authorUserId: 'user-123',
    });
    assert.equal(context.authorUserId, 'user-123');
    assert.equal(context.authorLabel, 'Alice');
    await pool.query(`DELETE FROM "ProjectContext" WHERE id = 'singleton'`);
  });

  it('returns no warning for content within 1000 tokens', async () => {
    const smallContent = 'Short context.';
    const { warning } = await updateProjectContext(db, {
      content: smallContent,
      authorLabel: 'agent',
    });
    assert.equal(warning, undefined);
    await pool.query(`DELETE FROM "ProjectContext" WHERE id = 'singleton'`);
  });

  it('returns a warning when content exceeds 1000 tokens', async () => {
    // ~4001 chars ≈ 1001 tokens
    const largeContent = 'x'.repeat(4001);
    const { context, warning } = await updateProjectContext(db, {
      content: largeContent,
      authorLabel: 'agent',
    });
    assert.ok(warning !== undefined, 'expected a warning');
    assert.ok(warning!.includes('1000 tokens'), `unexpected warning: ${warning}`);
    assert.equal(context.content, largeContent, 'content should still be saved');
    await pool.query(`DELETE FROM "ProjectContext" WHERE id = 'singleton'`);
  });

  it('updates updatedAt on second write', async () => {
    await updateProjectContext(db, { content: 'v1', authorLabel: 'agent' });
    const before = await getProjectContext(db);
    await new Promise((r) => setTimeout(r, 10));
    await updateProjectContext(db, { content: 'v2', authorLabel: 'agent' });
    const after = await getProjectContext(db);
    assert.ok(after!.updatedAt >= before!.updatedAt);
    await pool.query(`DELETE FROM "ProjectContext" WHERE id = 'singleton'`);
  });
});
