import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { agentIssueWorkflow } from './agent-issue-workflow.ts';
import type { Issue } from './issue-service.ts';

function issue(overrides: Partial<Issue> = {}): Issue {
  const now = new Date();
  return {
    id: 'issue-1', key: 'TEST-1', title: 'Work', description: '', column: 'TODO',
    agentAssignee: null, agentAssignTs: null, doneAt: null, projectId: 'project-1',
    createdAt: now, updatedAt: now, ...overrides,
  };
}

function fakeDb(initial: Issue[], dependencies: Array<{ dependentId: string; dependsOnId: string }> = []) {
  const records = new Map(initial.map((record) => [record.id, { ...record }]));
  let failAfterUpdate = false;
  const db: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
    issue: {
      findUnique: async ({ where }: { where: { id?: string; key?: string; projectId?: string } }) => {
        const record = [...records.values()].find((candidate) =>
          (where.id === undefined || candidate.id === where.id) &&
          (where.key === undefined || candidate.key === where.key) &&
          (where.projectId === undefined || candidate.projectId === where.projectId));
        return record ? { ...record } : null;
      },
      update: async ({ where, data }: { where: { id: string; projectId?: string }; data: Partial<Issue> }) => {
        const record = records.get(where.id);
        if (!record || (where.projectId && record.projectId !== where.projectId)) throw new Error('not found');
        const updated = { ...record, ...data };
        records.set(where.id, updated);
        if (failAfterUpdate) throw new Error('simulated persistence failure');
        return { ...updated };
      },
    },
    issueDependency: {
      findMany: async ({ where }: { where: { dependentId?: string; dependsOnId?: string } }) =>
        dependencies.filter((dependency) =>
          (where.dependentId === undefined || dependency.dependentId === where.dependentId) &&
          (where.dependsOnId === undefined || dependency.dependsOnId === where.dependsOnId)),
    },
    $transaction: async <T>(operation: (tx: any) => Promise<T>): Promise<T> => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const snapshot = new Map([...records].map(([id, record]) => [id, { ...record }]));
      try {
        return await operation(db);
      } catch (error) {
        records.clear();
        for (const [id, record] of snapshot) records.set(id, record);
        throw error;
      }
    },
  };
  return {
    db,
    record: (id = 'issue-1') => records.get(id)!,
    failUpdates: () => { failAfterUpdate = true; },
  };
}

describe('agentIssueWorkflow.beginWork', () => {
  it('assigns and moves a TODO issue atomically', async () => {
    const store = fakeDb([issue()]);
    const begun = await agentIssueWorkflow(store.db, 'project-1').beginWork('TEST-1', 'agent-a');
    assert.equal(begun.column, 'IN_PROGRESS');
    assert.equal(begun.agentAssignee, 'agent-a');
    assert.ok(begun.agentAssignTs instanceof Date);
  });

  it('rejects fresh locks but permits stale locks', async () => {
    const fresh = fakeDb([issue({ agentAssignee: 'agent-b', agentAssignTs: new Date(Date.now() - 60_000) })]);
    await assert.rejects(() => agentIssueWorkflow(fresh.db, 'project-1').beginWork('TEST-1', 'agent-a'), /already assigned/i);
    assert.equal(fresh.record().column, 'TODO');
    assert.equal(fresh.record().agentAssignee, 'agent-b');

    const stale = fakeDb([issue({ agentAssignee: 'agent-b', agentAssignTs: new Date(Date.now() - 5 * 60 * 60 * 1000) })]);
    const begun = await agentIssueWorkflow(stale.db, 'project-1').beginWork('TEST-1', 'agent-a');
    assert.equal(begun.agentAssignee, 'agent-a');
    assert.equal(begun.column, 'IN_PROGRESS');
  });

  it('enforces Backlog and dependency gates without partial assignment', async () => {
    const backlog = fakeDb([issue({ column: 'BACKLOG' })]);
    await assert.rejects(() => agentIssueWorkflow(backlog.db, 'project-1').beginWork('TEST-1', 'agent-a'), /BACKLOG/);
    assert.equal(backlog.record().agentAssignee, null);
    assert.equal(backlog.record().column, 'BACKLOG');

    const blocker = issue({ id: 'blocker', key: 'TEST-2', title: 'Blocking work', column: 'IN_PROGRESS' });
    const blocked = fakeDb([issue(), blocker], [{ dependentId: 'issue-1', dependsOnId: 'blocker' }]);
    await assert.rejects(() => agentIssueWorkflow(blocked.db, 'project-1').beginWork('TEST-1', 'agent-a'), /Blocking work/);
    assert.equal(blocked.record().agentAssignee, null);
    assert.equal(blocked.record().column, 'TODO');
  });

  it('rejects invalid persisted columns', async () => {
    const store = fakeDb([issue({ column: 'QUEUED' })]);
    await assert.rejects(() => agentIssueWorkflow(store.db, 'project-1').beginWork('TEST-1', 'agent-a'), /Invalid column/);
  });

  it('rolls assignment and transition back when persistence fails', async () => {
    const store = fakeDb([issue()]);
    store.failUpdates();
    await assert.rejects(() => agentIssueWorkflow(store.db, 'project-1').beginWork('TEST-1', 'agent-a'), /persistence failure/);
    assert.equal(store.record().column, 'TODO');
    assert.equal(store.record().agentAssignee, null);
  });
});

describe('agentIssueWorkflow.submitForReview', () => {
  it('selects human and agent review columns and releases the assignment', async () => {
    for (const [review, expected] of [['human', 'NEEDS_HUMAN_REVIEW'], ['agent', 'NEEDS_AGENT_REVIEW']] as const) {
      const store = fakeDb([issue({ column: 'IN_PROGRESS', agentAssignee: 'agent-a', agentAssignTs: new Date() })]);
      const submitted = await agentIssueWorkflow(store.db, 'project-1').submitForReview('TEST-1', 'agent-a', review);
      assert.equal(submitted.column, expected);
      assert.equal(submitted.agentAssignee, null);
      assert.equal(submitted.agentAssignTs, null);
    }
  });

  it('rejects invalid review selections and work owned by another agent', async () => {
    const invalid = fakeDb([issue({ column: 'IN_PROGRESS', agentAssignee: 'agent-a' })]);
    await assert.rejects(() => agentIssueWorkflow(invalid.db, 'project-1').submitForReview('TEST-1', 'agent-a', 'peer'), /Invalid review/);
    assert.equal(invalid.record().column, 'IN_PROGRESS');

    const owned = fakeDb([issue({ column: 'IN_PROGRESS', agentAssignee: 'agent-b' })]);
    await assert.rejects(() => agentIssueWorkflow(owned.db, 'project-1').submitForReview('TEST-1', 'agent-a', 'human'), /agent-b/);
    assert.equal(owned.record().column, 'IN_PROGRESS');
    assert.equal(owned.record().agentAssignee, 'agent-b');
  });
});
