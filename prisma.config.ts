import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';

config({ path: '.env.local' });

export default defineConfig({
  migrations: {
    seed: 'node --experimental-strip-types prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
