import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractBearer } from './bearer.ts';

describe('extractBearer', () => {
  it('extracts token from valid Authorization header', () => {
    assert.equal(extractBearer('Bearer frg_abc123'), 'frg_abc123');
  });

  it('returns null for null header', () => {
    assert.equal(extractBearer(null), null);
  });

  it('returns null for undefined header', () => {
    assert.equal(extractBearer(undefined), null);
  });

  it('returns null when prefix is missing', () => {
    assert.equal(extractBearer('frg_abc123'), null);
  });

  it('returns null for empty string', () => {
    assert.equal(extractBearer(''), null);
  });

  it('returns null for "Bearer " with no token after', () => {
    assert.equal(extractBearer('Bearer '), null);
  });

  it('returns null for wrong scheme (Basic)', () => {
    assert.equal(extractBearer('Basic dXNlcjpwYXNz'), null);
  });
});
