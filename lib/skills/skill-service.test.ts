import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pkg from 'pg';
const { Pool } = pkg;
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

const DB_URL = process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/forge';
const pool = new Pool({ connectionString: DB_URL });

const TEST_PREFIX = `test-skill-${crypto.randomUUID().slice(0, 8)}`;

function makePgClient(pool: InstanceType<typeof Pool>) {
  return {
    skill: {
      create: async ({ data }: { data: { name: string; description?: string; prompt?: string } }): Promise<Skill> => {
        const id = crypto.randomUUID();
        const now = new Date();
        const r = await pool.query(
          `INSERT INTO "Skill" (id, name, description, prompt, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$5) RETURNING *`,
          [id, data.name, data.description ?? '', data.prompt ?? '', now]
        );
        return r.rows[0];
      },
      findUnique: async ({ where }: { where: { id?: string; name?: string } }): Promise<Skill | null> => {
        if (where.id) {
          const r = await pool.query(`SELECT * FROM "Skill" WHERE id = $1`, [where.id]);
          return r.rows[0] ?? null;
        }
        if (where.name) {
          const r = await pool.query(`SELECT * FROM "Skill" WHERE name = $1`, [where.name]);
          return r.rows[0] ?? null;
        }
        return null;
      },
      findMany: async ({ orderBy }: { orderBy?: { createdAt?: 'asc' | 'desc'; name?: 'asc' | 'desc' } } = {}): Promise<Skill[]> => {
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

type DbClient = ReturnType<typeof makePgClient>;
let db: DbClient;

before(() => {
  db = makePgClient(pool);
});

after(async () => {
  await pool.query(`DELETE FROM "Skill" WHERE name LIKE $1`, [`${TEST_PREFIX}%`]);
  await pool.end();
});

describe('createSkill', () => {
  it('creates a skill with name, description, and prompt', async () => {
    const skill = await createSkill(db as any, {
      name: `${TEST_PREFIX}-tdd`,
      description: 'Test-driven development workflow',
      prompt: '# TDD\n\nWrite tests first.',
    });
    assert.equal(skill.name, `${TEST_PREFIX}-tdd`);
    assert.equal(skill.description, 'Test-driven development workflow');
    assert.equal(skill.prompt, '# TDD\n\nWrite tests first.');
    assert.ok(skill.id.length > 0);
    assert.ok(skill.createdAt instanceof Date || typeof skill.createdAt === 'string');
  });

  it('defaults description and prompt to empty string when not provided', async () => {
    const skill = await createSkill(db as any, { name: `${TEST_PREFIX}-bare` });
    assert.equal(skill.description, '');
    assert.equal(skill.prompt, '');
  });
});

describe('getSkillByName', () => {
  it('returns a skill by its slug name', async () => {
    await createSkill(db as any, { name: `${TEST_PREFIX}-find-by-name`, description: 'For lookup' });
    const found = await getSkillByName(db as any, `${TEST_PREFIX}-find-by-name`);
    assert.ok(found !== null);
    assert.equal(found.name, `${TEST_PREFIX}-find-by-name`);
    assert.equal(found.description, 'For lookup');
  });

  it('returns null for unknown name', async () => {
    const result = await getSkillByName(db as any, `${TEST_PREFIX}-nonexistent-xyz`);
    assert.equal(result, null);
  });
});

describe('getSkillById', () => {
  it('returns a skill by id', async () => {
    const created = await createSkill(db as any, { name: `${TEST_PREFIX}-find-by-id` });
    const found = await getSkillById(db as any, created.id);
    assert.ok(found !== null);
    assert.equal(found.id, created.id);
  });

  it('returns null for unknown id', async () => {
    const result = await getSkillById(db as any, 'nonexistent-skill-id');
    assert.equal(result, null);
  });
});

describe('listSkills', () => {
  it('returns all skills as an array', async () => {
    const skills = await listSkills(db as any);
    assert.ok(Array.isArray(skills));
  });

  it('includes created skills in results', async () => {
    await createSkill(db as any, { name: `${TEST_PREFIX}-list-a`, description: 'List test A' });
    await createSkill(db as any, { name: `${TEST_PREFIX}-list-b`, description: 'List test B' });
    const skills = await listSkills(db as any);
    const names = skills.map((s) => s.name);
    assert.ok(names.includes(`${TEST_PREFIX}-list-a`));
    assert.ok(names.includes(`${TEST_PREFIX}-list-b`));
  });
});

describe('updateSkill', () => {
  it('updates description and prompt', async () => {
    const created = await createSkill(db as any, { name: `${TEST_PREFIX}-update`, description: 'Old desc', prompt: 'Old prompt' });
    const updated = await updateSkill(db as any, created.id, { description: 'New desc', prompt: 'New prompt' });
    assert.ok(updated !== null);
    assert.equal(updated.description, 'New desc');
    assert.equal(updated.prompt, 'New prompt');
  });

  it('returns null for unknown id', async () => {
    const result = await updateSkill(db as any, 'nonexistent-id', { description: 'x' });
    assert.equal(result, null);
  });
});

describe('deleteSkill', () => {
  it('removes the skill from the store', async () => {
    const created = await createSkill(db as any, { name: `${TEST_PREFIX}-delete-me` });
    await deleteSkill(db as any, created.id);
    const found = await getSkillById(db as any, created.id);
    assert.equal(found, null);
  });
});

describe('addSkillFile and getSkillWithFiles', () => {
  it('attaches a supporting file to a skill', async () => {
    const skill = await createSkill(db as any, { name: `${TEST_PREFIX}-with-file` });
    const file = await addSkillFile(db as any, skill.id, { name: 'ADR-FORMAT.md', content: '# ADR Format\n...' });
    assert.equal(file.skillId, skill.id);
    assert.equal(file.name, 'ADR-FORMAT.md');
    assert.equal(file.content, '# ADR Format\n...');
    assert.ok(file.id.length > 0);
  });

  it('getSkillWithFiles returns skill and all supporting files', async () => {
    const skill = await createSkill(db as any, { name: `${TEST_PREFIX}-with-files-2`, prompt: '# Skill' });
    await addSkillFile(db as any, skill.id, { name: 'FILE-A.md', content: 'Content A' });
    await addSkillFile(db as any, skill.id, { name: 'FILE-B.md', content: 'Content B' });

    const result = await getSkillWithFiles(db as any, `${TEST_PREFIX}-with-files-2`);
    assert.ok(result !== null);
    assert.equal(result.skill.name, `${TEST_PREFIX}-with-files-2`);
    assert.equal(result.files.length, 2);
    const fileNames = result.files.map((f) => f.name);
    assert.ok(fileNames.includes('FILE-A.md'));
    assert.ok(fileNames.includes('FILE-B.md'));
  });

  it('returns null when skill name not found', async () => {
    const result = await getSkillWithFiles(db as any, `${TEST_PREFIX}-ghost`);
    assert.equal(result, null);
  });

  it('returns skill with empty files array when no files attached', async () => {
    const skill = await createSkill(db as any, { name: `${TEST_PREFIX}-no-files` });
    const result = await getSkillWithFiles(db as any, skill.name);
    assert.ok(result !== null);
    assert.deepEqual(result.files, []);
  });
});

describe('deleteSkillFile', () => {
  it('removes a supporting file from a skill', async () => {
    const skill = await createSkill(db as any, { name: `${TEST_PREFIX}-del-file` });
    const file = await addSkillFile(db as any, skill.id, { name: 'REMOVE.md', content: 'to delete' });
    await deleteSkillFile(db as any, file.id);
    const result = await getSkillWithFiles(db as any, skill.name);
    assert.ok(result !== null);
    assert.deepEqual(result.files, []);
  });
});
