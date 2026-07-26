import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestPool, type TestPool } from '../test-support/db.ts';
import {
  createSkill,
  getSkillByName,
  getSkillById,
  listSkills,
  updateSkill,
  deleteSkill,
  addSkillFile,
  getSkillWithFiles,
  deleteSkillFile,
  type Skill,
  type SkillFile,
} from './skill-service.ts';

const pool = createTestPool();

const TEST_RUN = crypto.randomUUID().slice(0, 8);
const TEST_PREFIX = `test-skill-${TEST_RUN}`;
let testUserId: string;
let projectAId: string;
let projectBId: string;

function makeDbClient(pool: TestPool) {
  return {
    skill: {
      create: async ({ data }: { data: { name: string; description?: string; prompt?: string; projectId: string } }): Promise<Skill> => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "Skill" (id, name, description, prompt, "projectId", "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING *`,
          [id, data.name, data.description ?? '', data.prompt ?? '', data.projectId, now]
        );
        return r.rows[0];
      },
      findUnique: async ({ where }: { where: { id?: string; projectId_name?: { projectId: string; name: string } } }): Promise<Skill | null> => {
        if (where.id) {
          const r = await pool.query(`SELECT * FROM "Skill" WHERE id = $1`, [where.id]);
          return r.rows[0] ?? null;
        }
        if (where.projectId_name) {
          const r = await pool.query(
            `SELECT * FROM "Skill" WHERE "projectId" = $1 AND name = $2`,
            [where.projectId_name.projectId, where.projectId_name.name]
          );
          return r.rows[0] ?? null;
        }
        return null;
      },
      findMany: async ({ where, orderBy }: { where?: { projectId?: string }; orderBy?: { name?: 'asc' | 'desc' } } = {}): Promise<Skill[]> => {
        if (where?.projectId) {
          const r = await pool.query(
            `SELECT * FROM "Skill" WHERE "projectId" = $1 ORDER BY name ASC`,
            [where.projectId]
          );
          return r.rows;
        }
        const r = await pool.query(`SELECT * FROM "Skill" ORDER BY name ASC`);
        return r.rows;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<{ description: string; prompt: string; updatedAt: Date }> }): Promise<Skill> => {
        const entries = Object.entries(data).filter(([, v]) => v !== undefined);
        const fields = entries.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
        const values = entries.map(([, v]) => v);
        const r = await pool.query(
          `UPDATE "Skill" SET ${fields} WHERE id = $1 RETURNING *`,
          [where.id, ...values]
        );
        return r.rows[0];
      },
      delete: async ({ where }: { where: { id: string } }): Promise<void> => {
        await pool.query(`DELETE FROM "Skill" WHERE id = $1`, [where.id]);
      },
    },
    skillFile: {
      create: async ({ data }: { data: { skillId: string; name: string; content: string } }): Promise<SkillFile> => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "SkillFile" (id, "skillId", name, content, "createdAt")
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [id, data.skillId, data.name, data.content, now]
        );
        return r.rows[0];
      },
      findMany: async ({ where }: { where: { skillId: string } }): Promise<SkillFile[]> => {
        const r = await pool.query(
          `SELECT * FROM "SkillFile" WHERE "skillId" = $1 ORDER BY name ASC`,
          [where.skillId]
        );
        return r.rows;
      },
      delete: async ({ where }: { where: { id: string } }): Promise<void> => {
        await pool.query(`DELETE FROM "SkillFile" WHERE id = $1`, [where.id]);
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
    [userId, `test-skill-${TEST_RUN}@example.com`, 'hash']
  );
  testUserId = userId;

  const pAId = crypto.randomUUID();
  const pBId = crypto.randomUUID();
  const now = new Date();
  await pool.query(
    `INSERT INTO "Project" (id, name, slug, "createdByUserId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5),($6,$7,$8,$4,$5,$5)`,
    [pAId, `Skill Test A ${TEST_RUN}`, `skill-a-${TEST_RUN}`, userId, now, pBId, `Skill Test B ${TEST_RUN}`, `skill-b-${TEST_RUN}`]
  );
  projectAId = pAId;
  projectBId = pBId;
});

after(async () => {
  await pool.query(`DELETE FROM "Project" WHERE "createdByUserId" = $1`, [testUserId]);
  await pool.query(`DELETE FROM "User" WHERE id = $1`, [testUserId]);
  await pool.end();
});

describe('createSkill', () => {
  it('creates a skill with name, description, and prompt', async () => {
    const skill = await createSkill(db as any, projectAId, {
      name: `${TEST_PREFIX}-tdd`,
      description: 'Test-driven development workflow',
      prompt: '# TDD\n\nWrite tests first.',
    });
    assert.equal(skill.name, `${TEST_PREFIX}-tdd`);
    assert.equal(skill.description, 'Test-driven development workflow');
    assert.equal(skill.prompt, '# TDD\n\nWrite tests first.');
    assert.equal(skill.projectId, projectAId);
    assert.ok(skill.id.length > 0);
    assert.ok(skill.createdAt instanceof Date || typeof skill.createdAt === 'string');
  });

  it('defaults description and prompt to empty string when not provided', async () => {
    const skill = await createSkill(db as any, projectAId, { name: `${TEST_PREFIX}-bare` });
    assert.equal(skill.description, '');
    assert.equal(skill.prompt, '');
  });
});

describe('getSkillByName', () => {
  it('returns a skill by its slug name within the project', async () => {
    await createSkill(db as any, projectAId, { name: `${TEST_PREFIX}-find-by-name`, description: 'For lookup' });
    const found = await getSkillByName(db as any, projectAId, `${TEST_PREFIX}-find-by-name`);
    assert.ok(found !== null);
    assert.equal(found.name, `${TEST_PREFIX}-find-by-name`);
    assert.equal(found.description, 'For lookup');
  });

  it('returns null for unknown name', async () => {
    const result = await getSkillByName(db as any, projectAId, `${TEST_PREFIX}-nonexistent-xyz`);
    assert.equal(result, null);
  });

  it('returns null when skill exists in a different project', async () => {
    await createSkill(db as any, projectBId, { name: `${TEST_PREFIX}-only-b` });
    const result = await getSkillByName(db as any, projectAId, `${TEST_PREFIX}-only-b`);
    assert.equal(result, null);
  });
});

describe('getSkillById', () => {
  it('returns a skill by id', async () => {
    const created = await createSkill(db as any, projectAId, { name: `${TEST_PREFIX}-find-by-id` });
    const found = await getSkillById(db as any, projectAId, created.id);
    assert.ok(found !== null);
    assert.equal(found.id, created.id);
  });

  it('returns null for unknown id', async () => {
    const result = await getSkillById(db as any, projectAId, 'nonexistent-skill-id');
    assert.equal(result, null);
  });

  it('returns null when skill belongs to a different project', async () => {
    const created = await createSkill(db as any, projectBId, { name: `${TEST_PREFIX}-by-id-b` });
    const result = await getSkillById(db as any, projectAId, created.id);
    assert.equal(result, null);
  });
});

describe('listSkills', () => {
  it('returns skills as an array scoped to the project', async () => {
    const skills = await listSkills(db as any, projectAId);
    assert.ok(Array.isArray(skills));
    assert.ok(skills.every((s) => s.projectId === projectAId));
  });

  it('includes created skills in results', async () => {
    await createSkill(db as any, projectAId, { name: `${TEST_PREFIX}-list-a`, description: 'List test A' });
    await createSkill(db as any, projectAId, { name: `${TEST_PREFIX}-list-b`, description: 'List test B' });
    const skills = await listSkills(db as any, projectAId);
    const names = skills.map((s) => s.name);
    assert.ok(names.includes(`${TEST_PREFIX}-list-a`));
    assert.ok(names.includes(`${TEST_PREFIX}-list-b`));
  });

  it('does not return skills from another project', async () => {
    await createSkill(db as any, projectBId, { name: `${TEST_PREFIX}-only-in-b` });
    const skillsA = await listSkills(db as any, projectAId);
    assert.ok(!skillsA.some((s) => s.name === `${TEST_PREFIX}-only-in-b`));
  });
});

describe('updateSkill', () => {
  it('updates description and prompt', async () => {
    const created = await createSkill(db as any, projectAId, { name: `${TEST_PREFIX}-update`, description: 'Old desc', prompt: 'Old prompt' });
    const updated = await updateSkill(db as any, projectAId, created.id, { description: 'New desc', prompt: 'New prompt' });
    assert.ok(updated !== null);
    assert.equal(updated.description, 'New desc');
    assert.equal(updated.prompt, 'New prompt');
  });

  it('returns null for unknown id', async () => {
    const result = await updateSkill(db as any, projectAId, 'nonexistent-id', { description: 'x' });
    assert.equal(result, null);
  });

  it('returns null when skill belongs to a different project', async () => {
    const created = await createSkill(db as any, projectBId, { name: `${TEST_PREFIX}-update-b` });
    const result = await updateSkill(db as any, projectAId, created.id, { description: 'hacked' });
    assert.equal(result, null);
  });
});

describe('deleteSkill', () => {
  it('removes the skill from the store', async () => {
    const created = await createSkill(db as any, projectAId, { name: `${TEST_PREFIX}-delete-me` });
    await deleteSkill(db as any, projectAId, created.id);
    const found = await getSkillById(db as any, projectAId, created.id);
    assert.equal(found, null);
  });

  it('does not delete a skill that belongs to a different project', async () => {
    const created = await createSkill(db as any, projectBId, { name: `${TEST_PREFIX}-delete-b` });
    await deleteSkill(db as any, projectAId, created.id);
    const found = await getSkillById(db as any, projectBId, created.id);
    assert.ok(found !== null, 'skill in project B should still exist');
  });
});

describe('addSkillFile and getSkillWithFiles', () => {
  it('attaches a supporting file to a skill', async () => {
    const skill = await createSkill(db as any, projectAId, { name: `${TEST_PREFIX}-with-file` });
    const file = await addSkillFile(db as any, projectAId, skill.id, { name: 'ADR-FORMAT.md', content: '# ADR Format\n...' });
    assert.equal(file.skillId, skill.id);
    assert.equal(file.name, 'ADR-FORMAT.md');
    assert.equal(file.content, '# ADR Format\n...');
    assert.ok(file.id.length > 0);
  });

  it('getSkillWithFiles returns skill and all supporting files', async () => {
    const skill = await createSkill(db as any, projectAId, { name: `${TEST_PREFIX}-with-files-2`, prompt: '# Skill' });
    await addSkillFile(db as any, projectAId, skill.id, { name: 'FILE-A.md', content: 'Content A' });
    await addSkillFile(db as any, projectAId, skill.id, { name: 'FILE-B.md', content: 'Content B' });

    const result = await getSkillWithFiles(db as any, projectAId, `${TEST_PREFIX}-with-files-2`);
    assert.ok(result !== null);
    assert.equal(result.skill.name, `${TEST_PREFIX}-with-files-2`);
    assert.equal(result.files.length, 2);
    const fileNames = result.files.map((f) => f.name);
    assert.ok(fileNames.includes('FILE-A.md'));
    assert.ok(fileNames.includes('FILE-B.md'));
  });

  it('returns null when skill name not found in project', async () => {
    const result = await getSkillWithFiles(db as any, projectAId, `${TEST_PREFIX}-ghost`);
    assert.equal(result, null);
  });

  it('returns null when skill exists in a different project', async () => {
    await createSkill(db as any, projectBId, { name: `${TEST_PREFIX}-only-b-files` });
    const result = await getSkillWithFiles(db as any, projectAId, `${TEST_PREFIX}-only-b-files`);
    assert.equal(result, null);
  });

  it('returns skill with empty files array when no files attached', async () => {
    const skill = await createSkill(db as any, projectAId, { name: `${TEST_PREFIX}-no-files` });
    const result = await getSkillWithFiles(db as any, projectAId, skill.name);
    assert.ok(result !== null);
    assert.deepEqual(result.files, []);
  });
});

describe('deleteSkillFile', () => {
  it('removes a supporting file from a skill', async () => {
    const skill = await createSkill(db as any, projectAId, { name: `${TEST_PREFIX}-del-file` });
    const file = await addSkillFile(db as any, projectAId, skill.id, { name: 'REMOVE.md', content: 'to delete' });
    await deleteSkillFile(db as any, projectAId, file.id);
    const result = await getSkillWithFiles(db as any, projectAId, skill.name);
    assert.ok(result !== null);
    assert.deepEqual(result.files, []);
  });
});
