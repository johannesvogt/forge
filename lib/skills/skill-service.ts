export interface Skill {
  id: string;
  name: string;
  description: string;
  prompt: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillFile {
  id: string;
  skillId: string;
  name: string;
  content: string;
  createdAt: Date;
}

interface CreateSkillInput {
  name: string;
  description?: string;
  prompt?: string;
}

interface UpdateSkillInput {
  description?: string;
  prompt?: string;
}

interface Db {
  skill: {
    create(args: { data: { name: string; description: string; prompt: string; projectId: string } }): Promise<Skill>;
    findUnique(args: { where: { id?: string; projectId_name?: { projectId: string; name: string } } }): Promise<Skill | null>;
    findMany(args?: { where?: { projectId?: string }; orderBy?: { name?: 'asc' | 'desc' } }): Promise<Skill[]>;
    update(args: { where: { id: string }; data: Partial<{ description: string; prompt: string; updatedAt: Date }> }): Promise<Skill>;
    delete(args: { where: { id: string } }): Promise<void>;
  };
  skillFile: {
    create(args: { data: { skillId: string; name: string; content: string } }): Promise<SkillFile>;
    findMany(args: { where: { skillId: string } }): Promise<SkillFile[]>;
    delete(args: { where: { id: string } }): Promise<void>;
  };
}

export async function createSkill(db: Db, projectId: string, input: CreateSkillInput): Promise<Skill> {
  return db.skill.create({
    data: {
      name: input.name,
      description: input.description ?? '',
      prompt: input.prompt ?? '',
      projectId,
    },
  });
}

export async function getSkillByName(db: Db, projectId: string, name: string): Promise<Skill | null> {
  return db.skill.findUnique({ where: { projectId_name: { projectId, name } } });
}

export async function getSkillById(db: Db, projectId: string, id: string): Promise<Skill | null> {
  const skill = await db.skill.findUnique({ where: { id } });
  if (!skill || skill.projectId !== projectId) return null;
  return skill;
}

export async function listSkills(db: Db, projectId: string): Promise<Skill[]> {
  return db.skill.findMany({ where: { projectId }, orderBy: { name: 'asc' } });
}

export async function updateSkill(db: Db, projectId: string, id: string, input: UpdateSkillInput): Promise<Skill | null> {
  const existing = await db.skill.findUnique({ where: { id } });
  if (!existing || existing.projectId !== projectId) return null;
  return db.skill.update({
    where: { id },
    data: {
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
      updatedAt: new Date(),
    },
  });
}

export async function deleteSkill(db: Db, projectId: string, id: string): Promise<void> {
  const existing = await db.skill.findUnique({ where: { id } });
  if (!existing || existing.projectId !== projectId) return;
  await db.skill.delete({ where: { id } });
}

export async function addSkillFile(
  db: Db,
  projectId: string,
  skillId: string,
  input: { name: string; content: string }
): Promise<SkillFile> {
  return db.skillFile.create({ data: { skillId, name: input.name, content: input.content } });
}

export async function getSkillWithFiles(
  db: Db,
  projectId: string,
  name: string
): Promise<{ skill: Skill; files: SkillFile[] } | null> {
  const skill = await db.skill.findUnique({ where: { projectId_name: { projectId, name } } });
  if (!skill) return null;
  const files = await db.skillFile.findMany({ where: { skillId: skill.id } });
  return { skill, files };
}

export async function deleteSkillFile(db: Db, projectId: string, fileId: string): Promise<void> {
  await db.skillFile.delete({ where: { id: fileId } });
}
