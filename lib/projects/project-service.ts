import { seedDefaultSkills } from '../skills/seed-skills.ts';

export class SlugConflictError extends Error {
  constructor(slug: string) {
    super(`A project with slug "${slug}" already exists`);
    this.name = 'SlugConflictError';
  }
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateInput {
  name: string;
  createdByUserId: string;
}

interface ProjectDb {
  create(args: { data: { name: string; slug: string; createdByUserId: string } }): Promise<Project>;
  findUnique(args: { where: { slug?: string; id?: string } }): Promise<Project | null>;
  findMany(args?: { orderBy?: { createdAt?: 'asc' | 'desc' } }): Promise<Project[]>;
  delete(args: { where: { id: string } }): Promise<void>;
}

interface SkillDb {
  findUnique(args: { where: { projectId_name?: { projectId: string; name: string } } }): Promise<{ id: string } | null>;
  create(args: { data: { name: string; description: string; prompt: string; projectId: string } }): Promise<{ id: string }>;
}

interface ProjectContextDb {
  create(args: { data: { projectId: string; content: string; authorLabel: string } }): Promise<{ id: string }>;
}

interface Db {
  project: ProjectDb;
  skill: SkillDb;
  projectContext: ProjectContextDb;
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function createProject(db: Db, input: CreateInput): Promise<Project> {
  const slug = generateSlug(input.name);

  let project: Project;
  try {
    project = await db.project.create({
      data: { name: input.name, slug, createdByUserId: input.createdByUserId },
    });
  } catch (err: unknown) {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('23505')) {
      throw new SlugConflictError(slug);
    }
    throw err;
  }

  await seedDefaultSkills(db as any, project.id);

  await db.projectContext.create({
    data: { projectId: project.id, content: '', authorLabel: 'system' },
  });

  return project;
}

export async function listProjects(db: Db): Promise<Project[]> {
  return db.project.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function getProject(db: Db, slug: string): Promise<Project | null> {
  return db.project.findUnique({ where: { slug } });
}

export async function deleteProject(db: Db, id: string): Promise<void> {
  await db.project.delete({ where: { id } });
}
