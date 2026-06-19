import { canTransition, transition, type Column } from './state-machine.ts';

export interface Issue {
  id: string;
  title: string;
  description: string;
  column: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateInput {
  title: string;
  description?: string;
  column?: string;
}

interface UpdateInput {
  title?: string;
  description?: string;
}

interface Db {
  issue: {
    create(args: { data: CreateInput }): Promise<Issue>;
    findMany(args?: { where?: { column?: string } }): Promise<Issue[]>;
    findUnique(args: { where: { id: string } }): Promise<Issue | null>;
    update(args: { where: { id: string }; data: Partial<Issue & { updatedAt: Date }> }): Promise<Issue>;
  };
}

export async function createIssue(db: Db, input: CreateInput): Promise<Issue> {
  return db.issue.create({
    data: {
      title: input.title,
      description: input.description ?? '',
      column: input.column ?? 'BACKLOG',
    },
  });
}

export async function listIssues(db: Db, column?: string): Promise<Issue[]> {
  return db.issue.findMany(column ? { where: { column } } : {});
}

export async function getIssue(db: Db, id: string): Promise<Issue | null> {
  return db.issue.findUnique({ where: { id } });
}

export async function updateIssue(db: Db, id: string, input: UpdateInput): Promise<Issue> {
  return db.issue.update({
    where: { id },
    data: { ...input, updatedAt: new Date() },
  });
}

export async function moveIssue(db: Db, id: string, targetColumn: Column): Promise<Issue> {
  const issue = await db.issue.findUnique({ where: { id } });
  if (!issue) throw new Error(`Issue not found: ${id}`);

  const from = issue.column as Column;
  const to = transition(from, targetColumn);

  return db.issue.update({
    where: { id },
    data: { column: to, updatedAt: new Date() },
  });
}
