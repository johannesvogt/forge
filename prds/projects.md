# PRD: Projects

## Problem Statement

Forge currently has a single global board, document register, skill set, and Project Context. All issues, documents, diffs, and skills are shared across all work — there is no way to separate concerns, run independent initiatives, or give agents a bounded scope of work. As usage grows, this global model becomes unworkable: unrelated issues pollute the board, skills from one domain interfere with another, and agents have no clear boundary of responsibility.

## Solution

Introduce Project as the top-level organizational unit in Forge. Every issue, document, diff, skill, and Project Context belongs to exactly one project. All users see all projects. Agents are scoped to one project via their API key — no extra parameter needed per call. Users manage projects from a landing page; all project-specific views live under a project-scoped URL. New projects are seeded with a default skill set and an empty Project Context.

## User Stories

### User — Project Management
1. As a user, I want to see a list of all projects on a landing page, so that I can navigate to the right project quickly.
2. As a user, I want to create a new project with a name, so that I can establish a new independent workspace.
3. As a user, I want project URLs to use a slug derived from the project name, so that links are human-readable.
4. As a user, I want to delete a project, so that I can remove work that is no longer needed.
5. As a user, I want a confirmation step before deleting a project, so that I do not accidentally lose all its data.
6. As a user, I want a new project to be pre-populated with the default skill set, so that agents have repeatable workflows from day one.
7. As a user, I want to navigate directly from the projects landing page into a project's board, so that I can get to work immediately.

### User — Project-Scoped Navigation
8. As a user, I want the board URL to include the project slug (`/projects/[slug]/board`), so that I can bookmark and share project-specific views.
9. As a user, I want the document register URL to include the project slug, so that documents from different projects are never mixed.
10. As a user, I want the skills page to include the project slug, so that each project's skill set is independently managed.
11. As a user, I want the Project Context page to include the project slug, so that each project has its own canonical glossary.
12. As a user, I want the diffs view to include the project slug, so that code review artifacts are scoped to the right project.

### User — API Key Management
13. As a user, I want to create an API key scoped to a specific project, so that the agent using that key can only interact with that project's data.
14. As a user, I want to see which project each API key is scoped to, so that I know which agent is working on which project.
15. As a user, I want to revoke a project-scoped API key, so that I can cut off an agent's access without affecting other projects.

### Agent — Project Scoping
16. As an agent, I want my project scope to be determined by my API key, so that I do not need to pass a project identifier on every MCP call.
17. As an agent, I want all MCP tools (issues, documents, diffs, skills, Project Context) to automatically operate within my project, so that I cannot accidentally read or write data belonging to another project.
18. As an agent, I want to load the Project Context for my project, so that I get orientation specific to the work I am doing.
19. As an agent, I want to update the Project Context for my project only, so that my edits do not affect other projects.
20. As an agent, I want to list and load skills from my project, so that I follow workflows relevant to this project.
21. As an agent, I want to create issues within my project, so that new work surfaces in the right place.
22. As an agent, I want to list issues within my project only, so that I am not distracted by issues from other projects.
23. As an agent, I want to create documents within my project, so that artifacts are traceable to the right project.
24. As an agent, I want to upload diffs within my project, so that code review artifacts land in the right project.

### User — Skill Management per Project
25. As a user, I want to add a new skill to a project, so that I can give agents new workflows specific to this project.
26. As a user, I want to edit a skill within a project without affecting other projects, so that customisation is isolated.
27. As a user, I want to delete a skill from a project, so that I can remove workflows that are no longer relevant.

## Implementation Decisions

### Data Model

Add a `Project` model with fields: `id` (cuid), `name` (string), `slug` (string, unique), `createdByUserId` (string, FK to User), `createdAt`, `updatedAt`.

Add `projectId` (FK to Project, cascade delete) to: `Issue`, `Document`, `Diff`, `Skill`, `ProjectContext`, `ApiKey`.

`ProjectContext` changes from a singleton (hard-coded `id: "singleton"`) to a per-project record identified by `projectId`. The unique constraint moves from `id` to `projectId`.

`Skill.name` uniqueness changes from globally unique to unique per project (`@@unique([projectId, name])`).

All existing data is dropped. No migration of legacy global records.

### Project Service (new deep module)

`createProject(db, { name, slug, createdByUserId })`:
- Creates the Project record.
- Calls `seedDefaultSkills(db, projectId)` to seed the project's skill set.
- Creates an empty ProjectContext for the project.
- Returns the new project.

`listProjects(db)` — returns all projects ordered by `createdAt` desc.

`getProject(db, slug)` — returns a single project by slug, or null.

`deleteProject(db, id)` — deletes the project; cascade handles all child records.

Slug generation: auto-derived from name (lowercase, spaces → hyphens, strip non-alphanumeric). Uniqueness enforced at DB level; service surfaces conflict as a domain error.

### API Key Service (modify)

`createApiKey(db, userId, label, projectId)` — adds `projectId` to the created record.

`findActiveApiKey(db, rawKey)` — returns `{ userId, label, projectId }`. The MCP entry point uses `projectId` to scope the server.

`listApiKeys(db, userId)` — returns keys with `projectId` included.

### Domain Services (modify)

`issue-service`, `document-service`, `diff-service`, `skill-service`, `context-service`: all read/write functions gain a `projectId` parameter and filter/scope all DB queries by it. No service ever reads or writes across project boundaries.

`seedDefaultSkills(db, projectId)` — the existing seed list is written into the given project. Called only at project creation.

### MCP Layer (modify)

`createMcpServer(db, agentLabel, projectId)` — receives `projectId` resolved at startup from the API key. All tool handlers pass `projectId` to the relevant service. The server has no mechanism to override or change the project — it is fixed at process start.

MCP entry point (`mcp/index.ts`): after `findActiveApiKey`, extract `projectId` and pass to `createMcpServer`. Exit with error if the API key has no project (e.g. revoked or legacy key).

### API Routes (new/modify)

New project routes (user auth required):
- `POST /api/projects` — create project, seed skills, return project with slug.
- `GET /api/projects` — list all projects.
- `GET /api/projects/[slug]` — get single project.
- `DELETE /api/projects/[slug]` — delete project and all data.

API key routes updated:
- `POST /api/account/api-keys` — now requires `projectId` in body.
- `GET /api/account/api-keys` — returns `projectId` per key.

Existing resource routes (`/api/issues`, `/api/documents`, etc.) are called only from project-scoped UI pages; the `projectId` is resolved from the URL slug server-side.

### UI Routing

New routes:
- `/projects` — landing page listing all projects.
- `/projects/new` — create project form.

All existing resource routes move under `/projects/[slug]/`:
- `/projects/[slug]/board`
- `/projects/[slug]/board/[id]`
- `/projects/[slug]/documents`
- `/projects/[slug]/documents/[id]`
- `/projects/[slug]/diffs/[id]`
- `/projects/[slug]/skills`
- `/projects/[slug]/skills/[id]`
- `/projects/[slug]/context`

A shared layout component at `/projects/[slug]/layout.tsx` resolves and provides the project from the slug so all child pages have access to it without re-fetching.

Root `/` redirects to `/projects`.

Account page API key creation gains a project selector dropdown.

## Testing Decisions

Good tests verify external behaviour through the module's public interface, not implementation details. Tests should not assert on SQL queries, internal state, or call counts — only on what the service returns or what ends up in the database when read back through the same interface.

Integration tests hit a real database (test Postgres instance). No mocks for the DB layer. This pattern is already established in the codebase (see `issue-service.test.ts`, `document-service.test.ts`, etc.).

**Modules with integration tests:**

- `project-service` — create, list, get by slug, delete cascade (verify all child records removed), slug conflict error.
- `api-key-service` — create with projectId, findActiveApiKey returns projectId, revoke still works.
- `issue-service` — create and list scoped to project (verify issues from other projects not returned).
- `document-service` — same scoping pattern.
- `diff-service` — same scoping pattern.
- `skill-service` — list/get scoped to project; seed writes into correct project.
- `context-service` — get/update scoped to project; no cross-project bleed.
- `mcp/server` — existing tests extended: server constructed with projectId, tool calls return only project-scoped data, verify a tool call cannot reach another project's data.

## Out of Scope

- Per-project user permissions or access control (all users see all projects).
- Project-level settings or configuration beyond name and slug.
- Transferring issues, documents, or skills between projects.
- Project templates beyond the default skill seed.
- Archiving or soft-deleting projects.
- Custom column configuration per project.
- Agent-created projects.

## Implementation Progress

### Issue #16 — Project service (done 2026-06-19)

- Created `lib/projects/project-service.ts` with `createProject`, `listProjects`, `getProject`, `deleteProject`, and `SlugConflictError`.
- Slug generation: lowercase, spaces → hyphens, non-alphanumeric stripped, consecutive hyphens collapsed.
- `createProject` seeds default skills into the project and creates an empty `ProjectContext` by calling `seedDefaultSkills` and `db.projectContext.create`.
- Updated `lib/skills/seed-skills.ts`: `seedDefaultSkills` now requires a `projectId` argument and uses the compound unique key `{ projectId_name: { projectId, name } }` for duplicate detection.
- Removed stale global `seedDefaultSkills` call from `app/api/skills/route.ts` (route will be replaced in issue #20).
- 7 integration tests pass: create (slug, seeded skills, empty context), slug generation, list (ordered desc), get by slug (found + null), delete cascade (skills and context removed), slug conflict `SlugConflictError`.
- `tsc --noEmit` passes with zero errors.

### Issue #17 — Project-scoped API keys (done 2026-06-19)

- Updated `createApiKey(db, userId, label, projectId)` — `projectId` is now a required parameter, persisted on the `ApiKey` record.
- Updated `findActiveApiKey` — returns `{ userId, label, projectId }`.
- `listApiKeys` already returns `ApiKey[]`; `projectId` is included automatically now that the Prisma client is regenerated.
- Updated `app/api/account/api-keys/route.ts`: `POST` requires `projectId` in the request body; `GET` includes `projectId` in each key's response shape.
- Regenerated Prisma client (`prisma generate`) so the `ApiKey` type includes `projectId`.
- Test setup creates two isolated projects (A and B) per run; all `createApiKey` calls pass `testProjectId`.
- 12 integration tests pass: all original tests updated, plus: `listApiKeys` includes `projectId`; `findActiveApiKey` returns correct `projectId`; key for project A returns project A id, not project B id.
- `tsc --noEmit` passes with zero errors.

### Issue #15 — Project schema (done 2026-06-19)

- `schema.prisma` already had the full Project model and `projectId` FKs; the stale migration was replaced.
- Deleted old `20260619204655_init` migration and generated `20260619212541_init` from the current schema.
- Migration applies cleanly to a fresh Postgres 16 database.
- `tsc --noEmit` passes with zero errors.
- Existing tests that INSERT without `projectId` now fail with a not-null constraint violation — this is expected and will be fixed in issues #17/#18 when the service layer is updated.

### Issue #19 — MCP project scoping (done 2026-06-20)

- `createMcpServer(db, agentLabel, projectId)` signature already in place from issue #18.
- All 18 MCP tools (`list_issues`, `get_issue`, `create_issue`, `update_issue`, `move_issue`, `list_comments`, `add_comment`, `create_doc`, `get_doc`, `update_doc`, `list_docs`, `upload_diff`, `get_diff`, `list_diffs`, `list_skills`, `get_skill`, `get_project_context`, `update_project_context`) forward `projectId` to the service layer.
- `mcp/index.ts` exits with a non-zero code and descriptive error if the resolved API key has no `projectId`.
- Added cross-project isolation test to `mcp/server.test.ts`: two in-memory servers constructed with different `projectId`s; issue created via server B is not visible when listing issues on server A, and is visible on server B.
- 238 integration tests pass; `tsc --noEmit` passes with zero errors.

### Issue #20 — Project API routes (done 2026-06-20)

- Created `lib/api/projects.ts` with `parseCreateProjectBody` (input validation) and `formatProject` (response shaping).
- Added `lib/api/projects.test.ts` with 9 unit tests covering all validation edge cases and response field exposure.
- Created `app/api/projects/route.ts`: `GET` lists all projects; `POST` creates a project (validates name, returns 201 with `{ id, name, slug, createdAt }`, returns 409 on slug conflict).
- Created `app/api/projects/[slug]/route.ts`: `GET` returns a project by slug or 404; `DELETE` deletes by slug (404 if not found, 204 on success).
- All 4 routes require a user session; unauthenticated requests return 401.
- API key routes (`POST /api/account/api-keys`, `GET /api/account/api-keys`) were already done in issue #17.
- 247 tests pass (9 new unit tests added); `tsc --noEmit` passes with zero errors.

### Issue #18 — Domain services project scoping (done 2026-06-19)

- All 5 domain services updated: `issue-service`, `document-service`, `diff-service`, `skill-service`, `context-service`.
- Every public function gained a `projectId: string` second parameter; all DB queries filter/scope by `projectId`.
- `context-service`: removed singleton pattern (`id: 'singleton'`); switched to per-project upsert via `ON CONFLICT ("projectId")`.
- `skill-service.getSkillByName`: uses compound unique key `{ projectId_name: { projectId, name } }`.
- Cross-project isolation tests added to every service: data created in project A is not visible when querying from project B.
- `mcp/server.ts`: `createMcpServer(db, agentLabel, projectId)` — `projectId` fixed at startup, passed to every service call.
- `mcp/index.ts`: extracts `projectId` from `findActiveApiKey` result; exits with error if `projectId` is falsy.
- 17 API route files updated with `const projectId = '';` placeholder and `// TODO(issue #20)` comment.
- 237 integration tests pass across all services and MCP server suite.
- `tsc --noEmit` passes with zero errors.

## Further Notes

The slug is the primary human-readable identifier used in URLs. If a project is renamed, the slug should remain stable to avoid breaking bookmarks — slug is set at creation and is not updated when the name changes. This can be revisited if renaming becomes a user need.

The default skill seed list lives in code (`seed-skills.ts`). Updating the seed list has no effect on existing projects — skills are fully owned by each project after creation.
