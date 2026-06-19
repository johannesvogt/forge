import crypto from 'node:crypto';

export function generateApiKey(): string {
  return `frg_${crypto.randomBytes(32).toString('hex')}`;
}

export function extractLast4(key: string): string {
  return key.slice(-4);
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function verifyApiKey(key: string, hash: string): boolean {
  const keyHash = hashApiKey(key);
  // constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(keyHash, 'hex'), Buffer.from(hash, 'hex'));
}
