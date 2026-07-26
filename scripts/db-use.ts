// Syncs the static `provider` in prisma/schema.prisma with DATABASE_URL, then
// regenerates the client. Prisma bakes the SQL dialect into the generated client
// at `prisma generate` time and refuses an env var for `datasource.provider`, so
// this one line has to be rewritten whenever you switch databases.
//
//   npm run db:use
//
// Reads DATABASE_URL from .env.local (or the environment). Everything else —
// the driver adapter (lib/prisma.ts) and the migrations directory
// (prisma.config.ts) — derives from DATABASE_URL on its own.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { config } from 'dotenv';
import { providerFromUrl, MIGRATIONS_DIR } from '../lib/db/provider.ts';

config({ path: '.env.local' });

const SCHEMA_PATH = 'prisma/schema.prisma';
const PROVIDER_LINE = /^(\s*provider\s*=\s*)"(sqlite|postgresql)"/m;

const url = process.env['DATABASE_URL'];
const provider = providerFromUrl(url);

const schema = readFileSync(SCHEMA_PATH, 'utf8');
const datasourceStart = schema.indexOf('datasource db {');
if (datasourceStart === -1) {
  throw new Error(`Could not find a "datasource db" block in ${SCHEMA_PATH}`);
}

const head = schema.slice(0, datasourceStart);
const tail = schema.slice(datasourceStart);
if (!PROVIDER_LINE.test(tail)) {
  throw new Error(`Could not find a provider line in the datasource block of ${SCHEMA_PATH}`);
}

const current = tail.match(PROVIDER_LINE)![2] as typeof provider;
if (current === provider) {
  console.log(`${SCHEMA_PATH} already targets ${provider}.`);
} else {
  writeFileSync(SCHEMA_PATH, head + tail.replace(PROVIDER_LINE, `$1"${provider}"`));
  console.log(`${SCHEMA_PATH}: ${current} -> ${provider}`);
}

console.log(`migrations: ${MIGRATIONS_DIR[provider]}`);
console.log('Running prisma generate...');
execFileSync('npx', ['prisma', 'generate'], { stdio: 'inherit' });
console.log(`\nReady. Apply the schema with: npx prisma migrate dev`);
