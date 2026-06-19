import type { PrismaClient, User } from '@prisma/client';
// PrismaClient is used as a parameter type only (injected by callers)
import { hashPassword, verifyPassword } from './password.ts';

export async function createUser(
  prisma: PrismaClient,
  email: string,
  password: string
): Promise<User> {
  const passwordHash = await hashPassword(password);
  return prisma.user.create({ data: { email, passwordHash } });
}

export async function findUserByEmail(
  prisma: PrismaClient,
  email: string
): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}

export async function validateUserCredentials(
  prisma: PrismaClient,
  email: string,
  password: string
): Promise<User | null> {
  const user = await findUserByEmail(prisma, email);
  if (!user) return null;
  const valid = await verifyPassword(password, user.passwordHash);
  return valid ? user : null;
}
