import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectArtifacts } from './project-artifact-service.ts';

function lookup(rows: Record<string, Record<string, unknown>>) {
  return { findUnique: async ({ where }: { where: { id: string } }) => rows[where.id] ?? null };
}

function makeDb() {
  const rows = {
    issues: {
      issueA: { id: 'issueA', projectId: 'projectA' },
      issueB: { id: 'issueB', projectId: 'projectB' },
    },
    documents: {
      docA: { id: 'docA', projectId: 'projectA' },
      docB: { id: 'docB', projectId: 'projectB' },
    },
    versions: {
      versionA: { id: 'versionA', documentId: 'docA' },
      versionB: { id: 'versionB', documentId: 'docB' },
    },
    diffs: {
      diffA: { id: 'diffA', projectId: 'projectA' },
      diffB: { id: 'diffB', projectId: 'projectB' },
    },
    skills: {
      skillA: { id: 'skillA', projectId: 'projectA' },
      skillB: { id: 'skillB', projectId: 'projectB' },
    },
    files: {
      fileA: { id: 'fileA', skillId: 'skillA' },
      fileB: { id: 'fileB', skillId: 'skillB' },
    },
  };
  let writes = 0;
  const comments: Record<string, unknown> = {};
  const db = {
    issue: lookup(rows.issues),
    document: lookup(rows.documents),
    documentVersion: lookup(rows.versions),
    diff: {
      ...lookup(rows.diffs),
      create: async ({ data }: { data: Record<string, unknown> }) => { writes++; return { id: 'newDiff', createdAt: new Date(), ...data }; },
    },
    skill: lookup(rows.skills),
    skillFile: {
      ...lookup(rows.files),
      create: async ({ data }: { data: Record<string, unknown> }) => { writes++; return { id: 'newFile', createdAt: new Date(), ...data }; },
      delete: async () => { writes++; },
    },
    comment: {
      findUnique: async ({ where }: { where: { id: string } }) => comments[where.id] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes++;
        return { id: 'comment', createdAt: new Date(), ...data };
      },
      findMany: async () => [],
      update: async () => { throw new Error('not used'); },
    },
  };
  return { db, writes: () => writes };
}

describe('projectArtifacts ownership seam', () => {
  it('accepts same-project parents and rejects cross-project and missing issues', async () => {
    const state = makeDb();
    const artifacts = projectArtifacts(state.db as never, 'projectA');
    assert.ok(await artifacts.uploadDiff({ title: 'diff', branch: 'b', diffText: '+x', issueId: 'issueA', authorLabel: 'agent' }));
    assert.equal(await artifacts.uploadDiff({ title: 'diff', branch: 'b', diffText: '+x', issueId: 'issueB', authorLabel: 'agent' }), null);
    assert.equal(await artifacts.uploadDiff({ title: 'diff', branch: 'b', diffText: '+x', issueId: 'missing', authorLabel: 'agent' }), null);
    assert.equal(state.writes(), 1);
  });

  it('validates each explicit comment target variant before reading or writing', async () => {
    const state = makeDb();
    const artifacts = projectArtifacts(state.db as never, 'projectA');
    assert.ok(await artifacts.addComment({ type: 'issue', issueId: 'issueA' }, { body: 'ok', authorLabel: 'agent' }));
    assert.ok(await artifacts.addComment({ type: 'documentVersion', documentId: 'docA', versionId: 'versionA' }, { body: 'ok', authorLabel: 'agent' }));
    assert.ok(await artifacts.addComment({ type: 'diff', diffId: 'diffA' }, { body: 'ok', authorLabel: 'agent' }));
    assert.equal(await artifacts.addComment({ type: 'issue', issueId: 'issueB' }, { body: 'no', authorLabel: 'agent' }), null);
    assert.equal(await artifacts.addComment({ type: 'documentVersion', documentId: 'docA', versionId: 'versionB' }, { body: 'no', authorLabel: 'agent' }), null);
    assert.equal(await artifacts.listComments({ type: 'diff', diffId: 'missing' }), null);
    assert.equal(state.writes(), 3);
  });

  it('requires both the project-owned skill and matching parent skill when deleting a file', async () => {
    const state = makeDb();
    const artifacts = projectArtifacts(state.db as never, 'projectA');
    assert.equal(await artifacts.deleteSkillFile('skillA', 'fileB'), false);
    assert.equal(await artifacts.deleteSkillFile('skillB', 'fileB'), false);
    assert.equal(await artifacts.deleteSkillFile('skillA', 'missing'), false);
    assert.equal(await artifacts.deleteSkillFile('skillA', 'fileA'), true);
    assert.equal(state.writes(), 1);
  });
});
