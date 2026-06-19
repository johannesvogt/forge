import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateApiKey, extractLast4, hashApiKey, verifyApiKey } from './api-keys.ts';

describe('generateApiKey', () => {
  it('starts with frg_ prefix', () => {
    const key = generateApiKey();
    assert.ok(key.startsWith('frg_'));
  });

  it('has sufficient length (>= 60 chars)', () => {
    const key = generateApiKey();
    assert.ok(key.length >= 60);
  });

  it('generates unique keys', () => {
    const k1 = generateApiKey();
    const k2 = generateApiKey();
    assert.notEqual(k1, k2);
  });
});

describe('extractLast4', () => {
  it('returns last 4 characters', () => {
    assert.equal(extractLast4('frg_abcdefgh1234'), '1234');
  });
});

describe('hashApiKey', () => {
  it('returns a hex string (SHA-256)', () => {
    const hash = hashApiKey('frg_somekey');
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same input', () => {
    const h1 = hashApiKey('frg_somekey');
    const h2 = hashApiKey('frg_somekey');
    assert.equal(h1, h2);
  });

  it('produces different hashes for different inputs', () => {
    const h1 = hashApiKey('frg_key1');
    const h2 = hashApiKey('frg_key2');
    assert.notEqual(h1, h2);
  });
});

describe('verifyApiKey', () => {
  it('returns true when key matches hash', () => {
    const key = generateApiKey();
    const hash = hashApiKey(key);
    assert.equal(verifyApiKey(key, hash), true);
  });

  it('returns false when key does not match hash', () => {
    const key = generateApiKey();
    const hash = hashApiKey(key);
    assert.equal(verifyApiKey('frg_wrongkey', hash), false);
  });
});
