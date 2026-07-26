import test from 'node:test';
import assert from 'node:assert/strict';
import type { Project } from '@prisma/client';
import {
  createRequestIdentityResolver,
  type RequestIdentityDependencies,
} from './request-identity';

const project = { id: 'project-1', name: 'Forge' } as Project;

function resolver(overrides: Partial<RequestIdentityDependencies> = {}) {
  return createRequestIdentityResolver({
    getSession: async () => null,
    findAgent: async () => null,
    findProject: async (id) => id === project.id ? project : null,
    ...overrides,
  });
}

function request(path = '/api/test?projectId=project-1', token?: string) {
  return new Request(`http://localhost${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

const humanSession = async () => ({
  user: { id: 'user-1', name: 'Ada', email: 'ada@example.test' },
});
const activeAgent = async (token: string) => token === 'active'
  ? { userId: 'owner-1', label: 'review-agent', projectId: 'project-1' }
  : null;

test('human-only resolves a human, canonical author, and Project', async () => {
  const result = await resolver({ getSession: humanSession })(request(), {
    policy: 'human-only',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.principal.kind, 'human');
  assert.deepEqual(result.author, { authorUserId: 'user-1', authorLabel: 'Ada' });
  assert.equal(result.project, project);
});

test('agent-only resolves an active project-scoped key', async () => {
  const result = await resolver({ findAgent: activeAgent })(request('/api/test', 'active'), {
    policy: 'agent-only',
    project: 'principal',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.principal.kind, 'agent');
  assert.deepEqual(result.author, { authorUserId: null, authorLabel: 'review-agent' });
  assert.equal(result.projectId, 'project-1');
});

test('either prefers a human session and falls back to an Agent', async () => {
  const human = await resolver({ getSession: humanSession, findAgent: activeAgent })(request('/', 'active'), {
    policy: 'either',
    project: 'none',
  });
  assert.equal(human.ok && human.principal.kind, 'human');

  const agent = await resolver({ findAgent: activeAgent })(request('/', 'active'), {
    policy: 'either',
    project: 'none',
  });
  assert.equal(agent.ok && agent.principal.kind, 'agent');
});

test('policies reject credentials of a disallowed principal type', async () => {
  const humanOnly = await resolver({ findAgent: activeAgent })(request('/', 'active'), {
    policy: 'human-only',
    project: 'none',
  });
  assert.equal(humanOnly.ok, false);
  if (!humanOnly.ok) assert.equal(humanOnly.response.status, 401);

  const agentOnly = await resolver({ getSession: humanSession })(request('/'), {
    policy: 'agent-only',
    project: 'none',
  });
  assert.equal(agentOnly.ok, false);
});

test('invalid and revoked Agent keys are unauthorized', async () => {
  for (const token of ['invalid', 'revoked']) {
    const result = await resolver({ findAgent: activeAgent })(request('/', token), {
      policy: 'agent-only',
      project: 'none',
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.response.status, 401);
  }
});

test('missing, unknown, and cross-project context is rejected before use', async () => {
  const resolveHuman = resolver({ getSession: humanSession });
  const missing = await resolveHuman(request('/api/test'), { policy: 'human-only' });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.response.status, 400);

  const unknown = await resolveHuman(request('/api/test?projectId=unknown'), { policy: 'human-only' });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.response.status, 404);

  const crossProject = await resolver({ findAgent: activeAgent })(
    request('/api/test?projectId=other', 'active'),
    { policy: 'either' },
  );
  assert.equal(crossProject.ok, false);
  if (!crossProject.ok) assert.equal(crossProject.response.status, 404);
});
