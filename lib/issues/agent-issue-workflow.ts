import { resolveIssue, type Db, type Issue } from './issue-service.ts';
import { COLUMNS, transition, type Column } from './state-machine.ts';

const STALE_LOCK_MS = 4 * 60 * 60 * 1000;

export type ReviewKind = 'human' | 'agent';

export interface AgentIssueWorkflowDb extends Db {
  $transaction<T>(operation: (tx: Db) => Promise<T>): Promise<T>;
}

export interface AgentIssueWorkflow {
  /** Claim a TODO issue and start it, as one atomic domain operation. */
  beginWork(ref: string, agentLabel: string): Promise<Issue>;
  /** Send owned work to the selected review queue and release its claim atomically. */
  submitForReview(ref: string, agentLabel: string, review: ReviewKind | string): Promise<Issue>;
}

function currentColumn(issue: Issue): Column {
  if ((COLUMNS as readonly string[]).includes(issue.column)) return issue.column as Column;
  throw new Error(`Invalid column on issue ${issue.key}: "${issue.column}"`);
}

function assertLockAvailable(issue: Issue, now: Date): void {
  if (!issue.agentAssignee) return;
  // Treat malformed locks conservatively rather than silently stealing them.
  if (!issue.agentAssignTs) {
    throw new Error(`Issue already assigned to "${issue.agentAssignee}"`);
  }
  const age = now.getTime() - new Date(issue.agentAssignTs).getTime();
  if (age < STALE_LOCK_MS) {
    throw new Error(`Issue already assigned to "${issue.agentAssignee}" (assigned ${Math.round(age / 60000)} min ago)`);
  }
}

function reviewColumn(review: ReviewKind | string): Column {
  if (review === 'human') return 'NEEDS_HUMAN_REVIEW';
  if (review === 'agent') return 'NEEDS_AGENT_REVIEW';
  throw new Error('Invalid review selection. Must be one of: human, agent');
}

async function requiredIssue(db: Db, projectId: string, ref: string): Promise<Issue> {
  const issue = await resolveIssue(db, projectId, ref);
  if (!issue) throw new Error(`Issue not found: ${ref}`);
  return issue;
}

/**
 * Project-scoped, intent-level interface for Agent issue work.
 *
 * Low-level move/assign functions remain in issue-service for administration and
 * recovery only. This interface deliberately performs one final issue update in
 * a transaction, so a failed gate cannot leave a claim or column change behind.
 */
export function agentIssueWorkflow(db: AgentIssueWorkflowDb, projectId: string): AgentIssueWorkflow {
  return {
    beginWork(ref, agentLabel) {
      return db.$transaction(async (tx) => {
        const issue = await requiredIssue(tx, projectId, ref);
        const from = currentColumn(issue);
        if (from === 'BACKLOG') {
          throw new Error('Agents cannot begin BACKLOG issues. A human must promote the issue to TODO first.');
        }
        const to = transition(from, 'IN_PROGRESS');
        const now = new Date();
        assertLockAvailable(issue, now);

        const dependencies = await tx.issueDependency.findMany({ where: { dependentId: issue.id } });
        const blockers = await Promise.all(
          dependencies.map((dependency) => tx.issue.findUnique({ where: { id: dependency.dependsOnId, projectId } }))
        );
        const notDone = blockers.filter((blocker) => blocker && blocker.column !== 'DONE').map((blocker) => blocker!.title);
        if (notDone.length > 0) {
          throw new Error(`Cannot start: dependencies not done: ${notDone.join(', ')}`);
        }

        return tx.issue.update({
          where: { id: issue.id, projectId },
          data: { column: to, agentAssignee: agentLabel, agentAssignTs: now, updatedAt: now },
        });
      });
    },

    submitForReview(ref, agentLabel, review) {
      return db.$transaction(async (tx) => {
        const issue = await requiredIssue(tx, projectId, ref);
        const to = reviewColumn(review);
        const from = currentColumn(issue);
        transition(from, to);
        if (issue.agentAssignee !== agentLabel) {
          throw new Error(
            issue.agentAssignee
              ? `Issue is assigned to "${issue.agentAssignee}", not "${agentLabel}"`
              : 'Issue is not assigned to this agent'
          );
        }
        const now = new Date();
        return tx.issue.update({
          where: { id: issue.id, projectId },
          data: { column: to, agentAssignee: null, agentAssignTs: null, updatedAt: now },
        });
      });
    },
  };
}
