import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createUser, findUserByEmail, validateUserCredentials } from './users.ts';

// pg-backed test double that matches the Prisma API subset used by users.ts
import pkg from 'pg';
const { Pool } = pkg;

const DB_URL = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/forge';
const pool = new Pool({ connectionString: DB_URL });

// Minimal Prisma-compatible db client backed by pg
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
        const field = where.email !== undefined ? 'email' : 'id';
        const value = where.email ?? where.id;
        const r = await pool.query(`SELECT * FROM "User" WHERE ${field === 'email' ? 'email' : 'id'} = $1`, [value]);
        return r.rows[0] ?? null;
      },
      deleteMany: async ({ where }: { where: { email?: { startsWith?: string } } }) => {
        if (where.email?.startsWith) {
          await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [where.email.startsWith + '%']);
        }
      },
    },
  };
}

type DbClient = ReturnType<typeof makePgClient>;
let db: DbClient;
const TEST_EMAIL = `test-auth-${Date.now()}@example.com`;

before(async () => {
  db = makePgClient(pool);
});

after(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: 'test-auth-' } } });
  await pool.end();
});

describe('createUser', () => {
  it('creates a user with a hashed password', async () => {
    const user = await createUser(db as any, TEST_EMAIL, 'password123');
    assert.equal(user.email, TEST_EMAIL);
    assert.ok(user.passwordHash.startsWith('$2b$'));
    assert.ok(user.id.length > 0);
  });

  it('rejects duplicate email', async () => {
    await assert.rejects(
      () => createUser(db as any, TEST_EMAIL, 'anotherpass'),
      /unique|duplicate/i
    );
  });
});

describe('findUserByEmail', () => {
  it('finds an existing user', async () => {
    const found = await findUserByEmail(db as any, TEST_EMAIL);
    assert.ok(found !== null);
    assert.equal(found.email, TEST_EMAIL);
  });

  it('returns null for unknown email', async () => {
    const found = await findUserByEmail(db as any, 'nobody@example.com');
    assert.equal(found, null);
  });
});

describe('validateUserCredentials', () => {
  it('returns user for correct credentials', async () => {
    const user = await validateUserCredentials(db as any, TEST_EMAIL, 'password123');
    assert.ok(user !== null);
    assert.equal(user.email, TEST_EMAIL);
  });

  it('returns null for wrong password', async () => {
    const user = await validateUserCredentials(db as any, TEST_EMAIL, 'wrongpassword');
    assert.equal(user, null);
  });

  it('returns null for unknown email', async () => {
    const user = await validateUserCredentials(db as any, 'nobody@example.com', 'password123');
    assert.equal(user, null);
  });
});
