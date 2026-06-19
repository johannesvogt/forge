import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './password.ts';

describe('hashPassword', () => {
  it('returns a bcrypt hash (starts with $2b$)', async () => {
    const hash = await hashPassword('secret123');
    assert.ok(hash.startsWith('$2b$'));
  });

  it('does not store plaintext', async () => {
    const hash = await hashPassword('secret123');
    assert.notEqual(hash, 'secret123');
  });

  it('produces different hashes for the same input (salted)', async () => {
    const h1 = await hashPassword('secret123');
    const h2 = await hashPassword('secret123');
    assert.notEqual(h1, h2);
  });
});

describe('verifyPassword', () => {
  it('returns true for correct password', async () => {
    const hash = await hashPassword('mypassword');
    const result = await verifyPassword('mypassword', hash);
    assert.equal(result, true);
  });

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('mypassword');
    const result = await verifyPassword('wrongpassword', hash);
    assert.equal(result, false);
  });

  it('returns false for empty string against non-empty hash', async () => {
    const hash = await hashPassword('mypassword');
    const result = await verifyPassword('', hash);
    assert.equal(result, false);
  });
});
