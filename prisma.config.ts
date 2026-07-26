import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';
import { providerFromUrl, MIGRATIONS_DIR } from './lib/db/provider.ts';

config({ path: '.env.local' });

// The migrations directory follows DATABASE_URL so `prisma migrate` always sees
// the history for the database it is actually connected to. The `provider` in
// schema.prisma has to be kept in sync separately — that is what `npm run db:use`
// does, because Prisma requires a static value there.
const provider = providerFromUrl(process.env['DATABASE_URL']);

export default defineConfig({
  migrations: {
    path: MIGRATIONS_DIR[provider],
    seed: 'node --experimental-strip-types prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
