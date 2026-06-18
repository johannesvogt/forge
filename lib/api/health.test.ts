import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { healthResponse } from './health.ts';

describe('healthResponse', () => {
  it('returns an object with status "ok"', () => {
    assert.deepEqual(healthResponse(), { status: 'ok' });
  });

  it('always returns the same shape', () => {
    const r1 = healthResponse();
    const r2 = healthResponse();
    assert.deepEqual(r1, r2);
  });
});
