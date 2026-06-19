import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createUser } from './users.ts';
import { createApiKey, listApiKeys, revokeApiKey, findActiveApiKey } from './api-key-service.ts';

import pkg from 'pg';
const { Pool } = pkg;

const DB_URL = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/forge';
const pool = new Pool({ connectionString: DB_URL });

function makePgClient(pool: InstanceType<typeof Pool>) {
  return {
    user: {
      create: async ({ data }: { data: { email: string; passwordHash: string } }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "User" (id, email, "passwordHash", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$4) RETURNING *`,
          [id, data.email, data.passwordHash, now]
        );
        return r.rows[0];
      },
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
        const value = where.email ?? where.id;
        const field = where.email !== undefined ? 'email' : 'id';
        const r = await pool.query(`SELECT * FROM "User" WHERE ${field} = $1`, [value]);
        return r.rows[0] ?? null;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        await pool.query(`DELETE FROM "User" WHERE id = $1`, [where.id]);
      },
      deleteMany: async ({ where }: { where: { email?: { startsWith?: string } } }) => {
        if (where.email?.startsWith) {
          await pool.query(`DELETE FROM "ApiKey" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [where.email.startsWith + '%']);
          await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [where.email.startsWith + '%']);
        }
      },
    },
    apiKey: {
      create: async ({ data }: { data: { userId: string; label: string; keyHash: string; last4: string; projectId: string } }) => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "ApiKey" (id, label, "keyHash", last4, "createdAt", "userId", "projectId") VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [id, data.label, data.keyHash, data.last4, now, data.userId, data.projectId]
        );
        return r.rows[0];
      },
      findMany: async ({ where, orderBy }: { where: { userId: string }; orderBy?: unknown }) => {
        const r = await pool.query(`SELECT * FROM "ApiKey" WHERE "userId" = $1 ORDER BY "createdAt" DESC`, [where.userId]);
        return r.rows;
      },
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const r = await pool.query(`SELECT * FROM "ApiKey" WHERE id = $1 AND "userId" = $2`, [where.id, where.userId]);
        return r.rows[0] ?? null;
      },
      findUnique: async ({ where }: { where: { keyHash: string } }) => {
        const r = await pool.query(`SELECT * FROM "ApiKey" WHERE "keyHash" = $1`, [where.keyHash]);
        return r.rows[0] ?? null;
      },
      update: async ({ where, data }: { where: { id: string }; data: { revokedAt: Date } }) => {
        const r = await pool.query(`UPDATE "ApiKey" SET "revokedAt" = $1 WHERE id = $2 RETURNING *`, [data.revokedAt, where.id]);
        return r.rows[0];
      },
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        await pool.query(`DELETE FROM "ApiKey" WHERE "userId" = $1`, [where.userId]);
      },
    },
  };
}

type DbClient = ReturnType<typeof makePgClient>;
let db: DbClient;
let testUserId: string;
let testProjectId: string;
let testProjectBId: string;

before(async () => {
  db = makePgClient(pool);
  const user = await createUser(db as any, `test-apikey-${Date.now()}@example.com`, 'password123');
  testUserId = user.id;

  const ts = Date.now();
  const projA = await pool.query(
    `INSERT INTO "Project" (id, name, slug, "createdByUserId", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,now(),now()) RETURNING id`,
    [crypto.randomUUID(), 'Test Project A', `test-apikey-proj-a-${ts}`, testUserId]
  );
  testProjectId = projA.rows[0].id;

  const projB = await pool.query(
    `INSERT INTO "Project" (id, name, slug, "createdByUserId", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,now(),now()) RETURNING id`,
    [crypto.randomUUID(), 'Test Project B', `test-apikey-proj-b-${ts}`, testUserId]
  );
  testProjectBId = projB.rows[0].id;
});

after(async () => {
  await pool.query(`DELETE FROM "Project" WHERE "createdByUserId" = $1`, [testUserId]);
  await pool.query(`DELETE FROM "User" WHERE email LIKE 'test-apikey-%'`);
  await pool.end();
});

describe('createApiKey', () => {
  it('returns a raw key starting with frg_', async () => {
    const { rawKey } = await createApiKey(db as any, testUserId, 'my-agent', testProjectId);
    assert.ok(rawKey.startsWith('frg_'));
  });

  it('persists a record with hashed key, last4, and projectId', async () => {
    const { rawKey, record } = await createApiKey(db as any, testUserId, 'test-label', testProjectId);
    assert.equal(record.label, 'test-label');
    assert.equal(record.last4, rawKey.slice(-4));
    assert.ok(record.keyHash.length === 64); // SHA-256 hex
    assert.equal(record.revokedAt, null);
    assert.equal(record.projectId, testProjectId);
  });
});

describe('listApiKeys', () => {
  it('returns api keys for the user', async () => {
    const keys = await listApiKeys(db as any, testUserId);
    assert.ok(keys.length >= 2);
    assert.ok(keys.every((k: any) => k.userId === testUserId));
  });

  it('does not return keys for unknown user', async () => {
    const keys = await listApiKeys(db as any, 'non-existent-user-id');
    assert.equal(keys.length, 0);
  });

  it('includes projectId on each key', async () => {
    const keys = await listApiKeys(db as any, testUserId);
    assert.ok(keys.every((k: any) => typeof k.projectId === 'string'));
  });
});

describe('revokeApiKey', () => {
  it('sets revokedAt on the key', async () => {
    const { record } = await createApiKey(db as any, testUserId, 'to-revoke', testProjectId);
    await revokeApiKey(db as any, record.id, testUserId);
    const updated = await pool.query(`SELECT * FROM "ApiKey" WHERE id = $1`, [record.id]);
    assert.ok(updated.rows[0].revokedAt instanceof Date);
  });

  it('throws when key does not belong to user', async () => {
    const { record } = await createApiKey(db as any, testUserId, 'another-key', testProjectId);
    await assert.rejects(
      () => revokeApiKey(db as any, record.id, 'wrong-user-id'),
      /not found/i
    );
  });
});

describe('findActiveApiKey', () => {
  it('returns userId and label for valid key', async () => {
    const { rawKey, record } = await createApiKey(db as any, testUserId, 'finder-key', testProjectId);
    const result = await findActiveApiKey(db as any, rawKey);
    assert.ok(result !== null);
    assert.equal(result.userId, testUserId);
    assert.equal(result.label, record.label);
  });

  it('returns null for unknown key', async () => {
    const result = await findActiveApiKey(db as any, 'frg_unknownkey12345');
    assert.equal(result, null);
  });

  it('returns null for revoked key', async () => {
    const { rawKey, record } = await createApiKey(db as any, testUserId, 'revoked-key', testProjectId);
    await revokeApiKey(db as any, record.id, testUserId);
    const result = await findActiveApiKey(db as any, rawKey);
    assert.equal(result, null);
  });

  it('returns the correct projectId for the key', async () => {
    const { rawKey } = await createApiKey(db as any, testUserId, 'proj-key', testProjectId);
    const result = await findActiveApiKey(db as any, rawKey);
    assert.ok(result !== null);
    assert.equal(result.projectId, testProjectId);
  });

  it('key for project A returns project A id, not project B id', async () => {
    const { rawKey } = await createApiKey(db as any, testUserId, 'proj-a-key', testProjectId);
    const result = await findActiveApiKey(db as any, rawKey);
    assert.ok(result !== null);
    assert.equal(result.projectId, testProjectId);
    assert.notEqual(result.projectId, testProjectBId);
  });
});
