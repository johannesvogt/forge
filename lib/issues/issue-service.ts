import { canTransition, transition, COLUMNS, type Column } from './state-machine.ts';

function normalizeColumn(value: string): Column {
  const upper = value.toUpperCase().replace(/ /g, '_') as Column;
  if ((COLUMNS as readonly string[]).includes(upper)) return upper;
  throw new Error(`Invalid column: "${value}". Must be one of: ${COLUMNS.join(', ')}`);
}

function buildPrefix(projectName: string): string {
  const clean = projectName.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (clean + 'XXXX').slice(0, 4);
}

export interface Issue {
  id: string;
  key: string;
  title: string;
  description: string;
  column: string;
  agentAssignee: string | null;
  agentAssignTs: Date | null;
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

interface IssueDependencyRecord {
  dependentId: string;
  dependsOnId: string;
}

interface Db {
  project: {
    update(args: { where: { id: string }; data: { issueCounter: { increment: number } }; select: { issueCounter: true; name: true } }): Promise<{ issueCounter: number; name: string }>;
  };
  issue: {
    create(args: { data: CreateInput & { projectId: string; key: string } }): Promise<Issue>;
    findMany(args?: { where?: { projectId?: string; column?: string } }): Promise<Issue[]>;
    findUnique(args: { where: { id?: string; key?: string; projectId?: string } }): Promise<Issue | null>;
    update(args: { where: { id: string; projectId?: string }; data: Partial<Issue & { updatedAt: Date }> }): Promise<Issue>;
  };
  issueDependency: {
    create(args: { data: { dependentId: string; dependsOnId: string } }): Promise<IssueDependencyRecord>;
    findMany(args: { where: { dependentId?: string; dependsOnId?: string } }): Promise<IssueDependencyRecord[]>;
    delete(args: { where: { dependentId_dependsOnId: { dependentId: string; dependsOnId: string } } }): Promise<void>;
    findUnique(args: { where: { dependentId_dependsOnId: { dependentId: string; dependsOnId: string } } }): Promise<IssueDependencyRecord | null>;
  };
}

export async function createIssue(db: Db, projectId: string, input: CreateInput): Promise<Issue> {
  const project = await db.project.update({
    where: { id: projectId },
    data: { issueCounter: { increment: 1 } },
    select: { issueCounter: true, name: true },
  });
  const key = `${buildPrefix(project.name)}-${project.issueCounter}`;
  return db.issue.create({
    data: {
      title: input.title,
      description: input.description ?? '',
      column: input.column ? normalizeColumn(input.column) : 'BACKLOG',
      projectId,
      key,
    },
  });
}

export async function listIssues(db: Db, projectId: string, column?: string): Promise<Issue[]> {
  return db.issue.findMany({ where: { projectId, ...(column ? { column } : {}) } });
}

export async function getIssue(db: Db, projectId: string, id: string): Promise<Issue | null> {
  return db.issue.findUnique({ where: { id, projectId } });
}

export async function getIssueByKey(db: Db, projectId: string, key: string): Promise<Issue | null> {
  return db.issue.findUnique({ where: { key, projectId } });
}

export async function resolveIssue(db: Db, projectId: string, ref: string): Promise<Issue | null> {
  if (/^[A-Z0-9]+-\d+$/.test(ref)) return getIssueByKey(db, projectId, ref);
  return getIssue(db, projectId, ref);
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

  if (from === 'TODO' && to === 'IN_PROGRESS') {
    const deps = await db.issueDependency.findMany({ where: { dependentId: id } });
    if (deps.length > 0) {
      const blockers = await Promise.all(deps.map((d) => db.issue.findUnique({ where: { id: d.dependsOnId } })));
      const notDone = blockers.filter((b) => b && b.column !== 'DONE').map((b) => b!.title);
      if (notDone.length > 0) {
        throw new Error(`Cannot start: dependencies not done: ${notDone.join(', ')}`);
      }
    }
  }

  return db.issue.update({
    where: { id, projectId },
    data: { column: to, updatedAt: new Date() },
  });
}

export async function addDependency(db: Db, projectId: string, dependentId: string, dependsOnId: string): Promise<void> {
  const dependent = await db.issue.findUnique({ where: { id: dependentId, projectId } });
  if (!dependent) throw new Error(`Issue not found: ${dependentId}`);
  const dependsOn = await db.issue.findUnique({ where: { id: dependsOnId, projectId } });
  if (!dependsOn) throw new Error(`Issue not found: ${dependsOnId}`);
  if (dependentId === dependsOnId) throw new Error('An issue cannot depend on itself');
  await db.issueDependency.create({ data: { dependentId, dependsOnId } });
}

export async function removeDependency(db: Db, projectId: string, dependentId: string, dependsOnId: string): Promise<void> {
  const dependent = await db.issue.findUnique({ where: { id: dependentId, projectId } });
  if (!dependent) throw new Error(`Issue not found: ${dependentId}`);
  await db.issueDependency.delete({ where: { dependentId_dependsOnId: { dependentId, dependsOnId } } });
}

export async function listDependencies(db: Db, projectId: string, issueId: string): Promise<Issue[]> {
  const deps = await db.issueDependency.findMany({ where: { dependentId: issueId } });
  const issues = await Promise.all(deps.map((d) => db.issue.findUnique({ where: { id: d.dependsOnId, projectId } })));
  return issues.filter((i): i is Issue => i !== null);
}

const STALE_LOCK_MS = 4 * 60 * 60 * 1000;

export async function assignIssue(db: Db, projectId: string, id: string, agentLabel: string): Promise<Issue> {
  const issue = await db.issue.findUnique({ where: { id, projectId } });
  if (!issue) throw new Error(`Issue not found: ${id}`);
  if (issue.agentAssignee && issue.agentAssignTs) {
    const age = Date.now() - new Date(issue.agentAssignTs).getTime();
    if (age < STALE_LOCK_MS) {
      throw new Error(`Issue already assigned to "${issue.agentAssignee}" (assigned ${Math.round(age / 60000)} min ago)`);
    }
  }
  return db.issue.update({
    where: { id, projectId },
    data: { agentAssignee: agentLabel, agentAssignTs: new Date(), updatedAt: new Date() },
  });
}

export async function unassignIssue(db: Db, projectId: string, id: string): Promise<Issue> {
  const issue = await db.issue.findUnique({ where: { id, projectId } });
  if (!issue) throw new Error(`Issue not found: ${id}`);
  return db.issue.update({
    where: { id, projectId },
    data: { agentAssignee: null, agentAssignTs: null, updatedAt: new Date() },
  });
}
