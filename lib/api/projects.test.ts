import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCreateProjectBody, formatProject } from './projects.ts';

describe('parseCreateProjectBody', () => {
  it('returns null for null input', () => {
    assert.equal(parseCreateProjectBody(null), null);
  });

  it('returns null for missing name', () => {
    assert.equal(parseCreateProjectBody({}), null);
  });

  it('returns null for non-string name', () => {
    assert.equal(parseCreateProjectBody({ name: 42 }), null);
  });

  it('returns null for empty string name', () => {
    assert.equal(parseCreateProjectBody({ name: '' }), null);
  });

  it('returns null for whitespace-only name', () => {
    assert.equal(parseCreateProjectBody({ name: '   ' }), null);
  });

  it('returns trimmed name for valid input', () => {
    assert.deepEqual(parseCreateProjectBody({ name: '  My Project  ' }), { name: 'My Project' });
  });

  it('returns name unchanged when already trimmed', () => {
    assert.deepEqual(parseCreateProjectBody({ name: 'Forge' }), { name: 'Forge' });
  });
});

describe('formatProject', () => {
  const project = {
    id: 'proj-1',
    name: 'Test Project',
    slug: 'test-project',
    createdByUserId: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };

  it('returns id, name, slug, and createdAt', () => {
    const result = formatProject(project);
    assert.deepEqual(result, {
      id: 'proj-1',
      name: 'Test Project',
      slug: 'test-project',
      createdAt: project.createdAt,
    });
  });

  it('does not expose createdByUserId or updatedAt', () => {
    const result = formatProject(project) as Record<string, unknown>;
    assert.equal(result['createdByUserId'], undefined);
    assert.equal(result['updatedAt'], undefined);
  });
});
