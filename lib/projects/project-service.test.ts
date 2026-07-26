import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestPool, type TestPool } from '../test-support/db.ts';
import {
  createProject,
  listProjects,
  getProject,
  deleteProject,
  SlugConflictError,
  type Project,
} from './project-service.ts';

const pool = createTestPool();

const TEST_RUN = crypto.randomUUID().slice(0, 8);
let testUserId: string;

function makeDbClient(pool: TestPool) {
  return {
    project: {
      create: async ({ data }: { data: { name: string; slug: string; createdByUserId: string } }): Promise<Project> => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "Project" (id, name, slug, "createdByUserId", "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$5) RETURNING *`,
          [id, data.name, data.slug, data.createdByUserId, now]
        );
        return r.rows[0];
      },
      findUnique: async ({ where }: { where: { slug?: string; id?: string } }): Promise<Project | null> => {
        if (where.slug) {
          const r = await pool.query(`SELECT * FROM "Project" WHERE slug = $1`, [where.slug]);
          return r.rows[0] ?? null;
        }
        if (where.id) {
          const r = await pool.query(`SELECT * FROM "Project" WHERE id = $1`, [where.id]);
          return r.rows[0] ?? null;
        }
        return null;
      },
      findMany: async ({ orderBy }: { orderBy?: { createdAt?: 'asc' | 'desc' } } = {}): Promise<Project[]> => {
        const r = await pool.query(`SELECT * FROM "Project" ORDER BY "createdAt" DESC`);
        return r.rows;
      },
      delete: async ({ where }: { where: { id: string } }): Promise<void> => {
        await pool.query(`DELETE FROM "Project" WHERE id = $1`, [where.id]);
      },
    },
    skill: {
      findUnique: async ({ where }: { where: { projectId_name?: { projectId: string; name: string } } }): Promise<{ id: string } | null> => {
        if (where.projectId_name) {
          const r = await pool.query(
            `SELECT * FROM "Skill" WHERE "projectId" = $1 AND name = $2`,
            [where.projectId_name.projectId, where.projectId_name.name]
          );
          return r.rows[0] ?? null;
        }
        return null;
      },
      create: async ({ data }: { data: { name: string; description: string; prompt: string; projectId: string } }): Promise<{ id: string }> => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "Skill" (id, name, description, prompt, "projectId", "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING *`,
          [id, data.name, data.description, data.prompt, data.projectId, now]
        );
        return r.rows[0];
      },
    },
    skillFile: {
      create: async ({ data }: { data: { skillId: string; name: string; content: string } }): Promise<{ id: string }> => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "SkillFile" (id, "skillId", name, content, "createdAt") VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [id, data.skillId, data.name, data.content, now]
        );
        return r.rows[0];
      },
    },
    projectContext: {
      create: async ({ data }: { data: { projectId: string; content: string; authorLabel: string } }): Promise<{ id: string }> => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "ProjectContext" (id, "projectId", content, "authorLabel", "updatedAt")
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [id, data.projectId, data.content, data.authorLabel, now]
        );
        return r.rows[0];
      },
    },
  };
}

type DbClient = ReturnType<typeof makeDbClient>;
let db: DbClient;

before(async () => {
  db = makeDbClient(pool);
  // Create a test user for FK
  const userId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO "User" (id, email, "passwordHash", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,now(),now())`,
    [userId, `test-${TEST_RUN}@example.com`, 'hash']
  );
  testUserId = userId;
});

after(async () => {
  // Cascade via Project delete cleans up skills/context
  await pool.query(`DELETE FROM "Project" WHERE "createdByUserId" = $1`, [testUserId]);
  await pool.query(`DELETE FROM "User" WHERE id = $1`, [testUserId]);
  await pool.end();
});

describe('createProject', () => {
  it('creates a project with a generated slug, seeds default skills, and creates empty context', async () => {
    const project = await createProject(db as any, {
      name: `Test Project ${TEST_RUN}`,
      createdByUserId: testUserId,
    });

    assert.ok(project.id.length > 0);
    assert.equal(project.name, `Test Project ${TEST_RUN}`);
    assert.match(project.slug, /^[a-z0-9-]+$/);
    assert.ok(project.slug.includes('test'));
    assert.ok(project.slug.includes('project'));

    // Skills were seeded
    const skills = await pool.query(`SELECT * FROM "Skill" WHERE "projectId" = $1`, [project.id]);
    assert.ok(skills.rows.length > 0, 'expected default skills to be seeded');

    // Empty context was created
    const ctx = await pool.query(`SELECT * FROM "ProjectContext" WHERE "projectId" = $1`, [project.id]);
    assert.equal(ctx.rows.length, 1);
    assert.equal(ctx.rows[0].content, '');
  });

  it('generates slug: lowercase, spaces to hyphens, strips non-alphanumeric', async () => {
    const project = await createProject(db as any, {
      name: `My Awesome! Proj ${TEST_RUN}`,
      createdByUserId: testUserId,
    });
    assert.ok(project.slug.startsWith('my-awesome-proj-'));
    assert.doesNotMatch(project.slug, /[A-Z!]/);
  });
});

describe('listProjects', () => {
  it('returns all projects ordered by createdAt desc', async () => {
    const p1 = await createProject(db as any, { name: `List A ${TEST_RUN}`, createdByUserId: testUserId });
    const p2 = await createProject(db as any, { name: `List B ${TEST_RUN}`, createdByUserId: testUserId });

    const projects = await listProjects(db as any);
    const ids = projects.map((p) => p.id);
    assert.ok(ids.includes(p1.id));
    assert.ok(ids.includes(p2.id));

    // Verify descending order (p2 created after p1, so should come first or equal)
    const p1Idx = ids.indexOf(p1.id);
    const p2Idx = ids.indexOf(p2.id);
    assert.ok(p2Idx <= p1Idx, 'p2 (newer) should appear before p1 (older)');
  });
});

describe('getProject', () => {
  it('returns a project by slug', async () => {
    const created = await createProject(db as any, { name: `Get Test ${TEST_RUN}`, createdByUserId: testUserId });
    const found = await getProject(db as any, created.slug);
    assert.ok(found !== null);
    assert.equal(found.id, created.id);
    assert.equal(found.slug, created.slug);
  });

  it('returns null for unknown slug', async () => {
    const result = await getProject(db as any, 'no-such-slug-xyz-' + TEST_RUN);
    assert.equal(result, null);
  });
});

describe('deleteProject', () => {
  it('removes the project and cascades to skills and context', async () => {
    const project = await createProject(db as any, {
      name: `Delete Me ${TEST_RUN}`,
      createdByUserId: testUserId,
    });

    // Verify child records exist
    const skillsBefore = await pool.query(`SELECT * FROM "Skill" WHERE "projectId" = $1`, [project.id]);
    assert.ok(skillsBefore.rows.length > 0);

    await deleteProject(db as any, project.id);

    // Project gone
    const found = await getProject(db as any, project.slug);
    assert.equal(found, null);

    // Skills cascade-deleted
    const skillsAfter = await pool.query(`SELECT * FROM "Skill" WHERE "projectId" = $1`, [project.id]);
    assert.equal(skillsAfter.rows.length, 0);

    // Context cascade-deleted
    const ctxAfter = await pool.query(`SELECT * FROM "ProjectContext" WHERE "projectId" = $1`, [project.id]);
    assert.equal(ctxAfter.rows.length, 0);
  });
});

describe('slug conflict', () => {
  it('throws SlugConflictError when two projects would share a slug', async () => {
    const name = `Conflict Test ${TEST_RUN}`;
    await createProject(db as any, { name, createdByUserId: testUserId });

    await assert.rejects(
      () => createProject(db as any, { name, createdByUserId: testUserId }),
      SlugConflictError
    );
  });
});
