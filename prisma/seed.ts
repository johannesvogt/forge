import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { createUser } from '../lib/auth/users.ts';

config({ path: '.env.local' });

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL']! });
const prisma = new PrismaClient({ adapter });

const SEED_EMAIL = process.env.SEED_EMAIL ?? 'admin@forge.local';
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'password';

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: SEED_EMAIL } });
  if (existing) {
    console.log(`User ${SEED_EMAIL} already exists, skipping.`);
    return;
  }
  await createUser(prisma, SEED_EMAIL, SEED_PASSWORD);
  console.log(`Created user: ${SEED_EMAIL}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
