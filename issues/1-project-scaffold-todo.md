## What to build

Initialize the Forge monorepo with Next.js (App Router), PostgreSQL, and Prisma. Wire up the dev environment so any subsequent slice can start building immediately against a running app and real database.

Deliver a deployed shell: a Next.js app that connects to PostgreSQL via Prisma, has a basic layout (nav shell, placeholder pages for Board, Documents, Diffs, Skills, Context), and passes a health-check route. No auth, no domain logic yet.

## Acceptance criteria

- [ ] Next.js App Router project initialised with TypeScript
- [ ] Prisma configured and connected to a local PostgreSQL instance
- [ ] `prisma migrate dev` runs cleanly from a fresh clone
- [ ] Basic layout shell renders with placeholder nav (Board, Documents, Diffs, Skills, Context)
- [ ] `/api/health` route returns `{ status: "ok" }`
- [ ] `npm run dev` starts without errors
- [ ] `npm run build` produces a clean build

## Blocked by

None — can start immediately
