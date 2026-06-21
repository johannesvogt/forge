import { canTransition, transition, COLUMNS, type Column } from './state-machine.ts';

function normalizeColumn(value: string): Column {
  const upper = value.toUpperCase().replace(/ /g, '_') as Column;
  if ((COLUMNS as readonly string[]).includes(upper)) return upper;
  throw new Error(`Invalid column: "${value}". Must be one of: ${COLUMNS.join(', ')}`);
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  column: string;
  projectId: string;
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
    create(args: { data: CreateInput & { projectId: string } }): Promise<Issue>;
    findMany(args?: { where?: { projectId?: string; column?: string } }): Promise<Issue[]>;
    findUnique(args: { where: { id: string; projectId?: string } }): Promise<Issue | null>;
    update(args: { where: { id: string; projectId?: string }; data: Partial<Issue & { updatedAt: Date }> }): Promise<Issue>;
  };
}

export async function createIssue(db: Db, projectId: string, input: CreateInput): Promise<Issue> {
  return db.issue.create({
    data: {
      title: input.title,
      description: input.description ?? '',
      column: input.column ? normalizeColumn(input.column) : 'BACKLOG',
      projectId,
    },
  });
}

export async function listIssues(db: Db, projectId: string, column?: string): Promise<Issue[]> {
  return db.issue.findMany({ where: { projectId, ...(column ? { column } : {}) } });
}

export async function getIssue(db: Db, projectId: string, id: string): Promise<Issue | null> {
  return db.issue.findUnique({ where: { id, projectId } });
}

export async function updateIssue(db: Db, projectId: string, id: string, input: UpdateInput): Promise<Issue> {
  return db.issue.update({
    where: { id, projectId },
    data: { ...input, updatedAt: new Date() },
  });
}

export async function moveIssue(db: Db, projectId: string, id: string, targetColumn: Column | string): Promise<Issue> {
  const issue = await db.issue.findUnique({ where: { id, projectId } });
  if (!issue) throw new Error(`Issue not found: ${id}`);

  const from = normalizeColumn(issue.column);
  const to = transition(from, normalizeColumn(targetColumn));

  return db.issue.update({
    where: { id, projectId },
    data: { column: to, updatedAt: new Date() },
  });
}
