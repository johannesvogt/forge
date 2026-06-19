import type { PrismaClient, ApiKey } from '@prisma/client';
import { generateApiKey, extractLast4, hashApiKey } from './api-keys.ts';

export async function createApiKey(
  prisma: PrismaClient,
  userId: string,
  label: string,
  projectId: string
): Promise<{ rawKey: string; record: ApiKey }> {
  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);
  const last4 = extractLast4(rawKey);
  const record = await prisma.apiKey.create({
    data: { userId, label, keyHash, last4, projectId },
  });
  return { rawKey, record };
}

export async function listApiKeys(
  prisma: PrismaClient,
  userId: string
): Promise<ApiKey[]> {
  return prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeApiKey(
  prisma: PrismaClient,
  id: string,
  userId: string
): Promise<void> {
  const key = await prisma.apiKey.findFirst({ where: { id, userId } });
  if (!key) throw new Error('API key not found');
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
}

export async function findActiveApiKey(
  prisma: PrismaClient,
  rawKey: string
): Promise<{ userId: string; label: string; projectId: string } | null> {
  const keyHash = hashApiKey(rawKey);
  const record = await prisma.apiKey.findUnique({ where: { keyHash } });
  if (!record || record.revokedAt !== null) return null;
  return { userId: record.userId, label: record.label, projectId: record.projectId };
}
