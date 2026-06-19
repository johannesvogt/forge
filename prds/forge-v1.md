# PRD: Forge v1

## Problem Statement

Software teams using AI agents face a coordination problem: agents produce work (documents, code, analyses) in isolation with no shared workspace, no review loop, and no institutional memory. Humans spend time hunting for outputs across chat logs, files, and emails. Agents restart cold every session with no project context, redoing orientation work repeatedly. There is no single place where humans can review, comment on, and approve agent work — so the feedback loop between agent and human is slow, lossy, and manual.

## Solution

Forge is an AI-first project management system. Agents do the primary work — creating issues, writing documents, uploading PR diffs, picking up tasks, iterating on feedback — while humans review, comment, and approve via a web UI. Agents interact exclusively through an MCP interface. A small, curated Project Context file gives every agent instant orientation. Skills stored in Forge give agents repeatable workflows. Everything is in one place: issues, documents, diffs, comments, and the project's canonical language.

## User Stories

### Agent — Issue Management
1. As an agent, I want to list open issues in the Todo column, so that I can pick up work without human intervention.
2. As an agent, I want to get the full detail of an issue, so that I have all context needed to execute it.
3. As an agent, I want to create an issue, so that I can surface newly discovered work for the team.
4. As an agent, I want to move an issue to In Progress, so that others know I am working on it.
5. As an agent, I want to move an issue to Needs Human Review, so that a human can approve my output.
6. As an agent, I want to move an issue to Needs Agent Review, so that a different agent can verify my work with a clean context.
7. As an agent, I want to move an issue to Done, so that completed work is marked as closed.
8. As an agent, I want to add a comment to an issue describing what I did, so that humans and other agents understand what happened.
9. As an agent, I want to read comments on an issue, so that I can act on human or agent feedback.
10. As an agent, I want to move an issue back to In Progress after rejection, so that I can iterate based on review comments.

### Agent — Document Management
11. As an agent, I want to create a document and link it to an issue, so that my output is traceable to the work that produced it.
12. As an agent, I want to update a document (creating a new version), so that I can iterate on it based on comments.
13. As an agent, I want to list documents linked to an issue, so that I can find prior work to build on.
14. As an agent, I want to get the current version of a document, so that I have the latest content to work from.
15. As an agent, I want to get a specific version of a document, so that I can understand how it evolved.
16. As an agent, I want to read inline comments on a document, so that I know exactly what sections need revision.

### Agent — Diff Management
17. As an agent, I want to upload a PR diff with metadata (title, description, branch, linked issue), so that my code changes are reviewable in context.
18. As an agent, I want to read line-level comments on a diff, so that I know exactly what code needs changing.
19. As an agent, I want to upload a revised diff after addressing comments, so that the review cycle continues.

### Agent — Skills
20. As an agent, I want to list available skills, so that I know what repeatable workflows are available to me.
21. As an agent, I want to load a skill by name, so that I can follow its instructions and supporting format files.

### Agent — Project Context
22. As an agent, I want to load the Project Context in a single MCP call, so that I can orient myself at the start of every session without reading through history.
23. As an agent, I want to update the Project Context after completing significant work, so that future agents start with current information.

### Human — Issue Tracker
24. As a human, I want to see all issues organized by column on a kanban board, so that I have a clear picture of project state at a glance.
25. As a human, I want to create an issue manually, so that I can add work that I've identified.
26. As a human, I want to move an issue between columns by dragging or clicking, so that I can adjust priorities without leaving the board.
27. As a human, I want to open an issue and read its full comment history, so that I can follow what agents have done.
28. As a human, I want to add a comment to an issue, so that I can give feedback to agents or other humans.
29. As a human, I want to approve an issue in Needs Human Review, moving it to Done or back to In Progress, so that I control the quality gate.
30. As a human, I want to see which issues are waiting for my review at a glance, so that I prioritise the right column.

### Human — Document Review
31. As a human, I want to view a document in a readable format, so that I can review agent-produced content.
32. As a human, I want to view the full version history of a document, so that I can see how it evolved.
33. As a human, I want to diff any two versions of a document, so that I can understand exactly what changed.
34. As a human, I want to leave an inline comment on a specific section of a document, so that my feedback is precisely targeted.
35. As a human, I want to approve a document, so that it is marked as reviewed and the linked issue moves forward.

### Human — Diff Review
36. As a human, I want to view an uploaded PR diff with syntax highlighting, so that I can review code changes clearly.
37. As a human, I want to leave a line-level comment on a diff, so that my code feedback is precise.
38. As a human, I want to see all diffs linked to an issue, so that I can follow the code evolution for that piece of work.
39. As a human, I want to approve a diff, so that the agent knows the code changes are accepted.

### Human — Skills
40. As a human, I want to view all skills in the system, so that I know what workflows are available to agents.
41. As a human, I want to create a new skill with a markdown prompt and optional supporting files, so that I can add repeatable workflows for agents.
42. As a human, I want to edit an existing skill, so that I can refine agent instructions as the project evolves.
43. As a human, I want to delete a skill, so that I can remove outdated workflows.

### Human — Project Context
44. As a human, I want to view and edit the Project Context in a markdown editor, so that I can correct or extend agent-maintained content.
45. As a human, I want to see when the Project Context was last updated and by whom (human or agent), so that I know how current it is.

### Human — Auth
46. As a human, I want to sign up with email and password, so that I have a personal account in Forge.
47. As a human, I want to log in with email and password, so that I can access the system.
48. As a human, I want to generate an API key, so that I can configure agents to authenticate with Forge.
49. As a human, I want to revoke an API key, so that I can cut off access when needed.

## Implementation Decisions

### Issue State Machine
Issues move through six columns in a defined state machine:

```
Backlog → Todo → In Progress → Needs Human Review → Done
                             → Needs Agent Review  → Done
                             → Done
```

Any column can transition back to In Progress when a reviewer rejects (adds a rejection comment and clicks "Request Changes"). The state machine is enforced server-side — invalid transitions return errors. The MCP `move_issue` tool accepts a target column and validates the transition.

### Document Store — Append-Only Versioning
Documents are first-class entities with a stable ID and a list of versions. Every `update_doc` call appends a new version snapshot — versions are never mutated. The current version is always the latest. Diffing between versions is computed on demand (unified diff format). Documents link to one originating issue and may be referenced by many issues via a join table.

### Diff Manager
A Diff is stored as a single artifact: raw unified diff text plus structured metadata (title, description, branch name, linked issue ID). Diffs are append-only — a revised diff is a new upload, not an edit of the prior one. Line anchors (file path + line number) are stored per comment to survive diff re-uploads.

### Comment Engine
Comments share a single data model with a polymorphic target:
- `issue` — thread on an issue
- `document_section` — anchored to a character offset range in a document version
- `diff_line` — anchored to a file path + line number in a specific diff

All comments support a `status` field (open / resolved). Author is either a human user ID or an agent identifier (derived from API key).

### Skill Registry
A Skill has a name (slug), a primary markdown prompt (`SKILL.md` equivalent), and zero or more named supporting files (e.g. `ADR-FORMAT.md`). Skills are stored in the database as text blobs. The MCP `get_skill` tool returns the primary prompt and all supporting files in a single response. Humans edit via a markdown editor in the web UI.

### Project Context Manager
One `CONTEXT.md` per project, stored as a text field on the project record. Soft size limit enforced at 1000 tokens (warned, not blocked). Last-updated timestamp and author (human or agent) tracked. MCP `get_project_context` returns raw markdown. MCP `update_project_context` replaces the full content.

### MCP Gateway
All agent access goes through an MCP server implementing the Model Context Protocol. Authentication via API key in the MCP connection headers. The gateway validates keys and translates tool calls to internal service calls. No business logic lives in the gateway — it is a thin translation layer.

Full MCP tool surface for v1:

```
Issues:   list_issues(column?, assignee?), get_issue(id), create_issue(title, description, column?),
          update_issue(id, title?, description?), move_issue(id, column)

Documents: list_docs(issue_id?), get_doc(id, version?), create_doc(title, content, issue_id),
           update_doc(id, content)

Diffs:    list_diffs(issue_id), get_diff(id), upload_diff(title, description, branch, diff_text, issue_id)

Comments: list_comments(target_type, target_id, anchor?), add_comment(target_type, target_id, body, anchor?)

Skills:   list_skills(), get_skill(name)

Context:  get_project_context(), update_project_context(content)
```

### Auth / Identity
Human auth: email + bcrypt password, JWT session tokens. Agent auth: opaque API keys stored as hashed values, passed as Bearer token. A single project has a pool of API keys (no per-agent keys in v1). Agent identity in comments is the API key's label.

### Tech Stack
- **Framework**: Next.js (App Router) — web UI and API routes in one repo
- **Database**: PostgreSQL via Prisma ORM
- **MCP Server**: TypeScript MCP SDK, runs as a separate process alongside the Next.js app
- **Auth**: NextAuth.js for human sessions; custom API key middleware for agents
- **Diff rendering**: `diff2html` for syntax-highlighted diff display

## Testing Decisions

Good tests in Forge verify external behavior through stable interfaces — not implementation details. A test that breaks when you rename a private method is a bad test. A test that breaks when a column transition is rejected is a good test.

### Modules to test

**Issue State Machine** — unit tested in isolation. Input: current column + target column. Output: success or rejection error. Every valid and invalid transition covered. No database, no HTTP.

**Version Store** — integration tested against a real database. Verify: creating a document produces version 1; updating produces version 2 with the new content; fetching version 1 still returns original content; diffing v1 and v2 returns correct unified diff.

**Comment Engine** — integration tested against a real database. Verify: add comment to issue, document section, and diff line; list comments returns correct results per target; resolve comment changes status; author identity recorded correctly for both human and agent.

**MCP Gateway** — integration tested with a real MCP client against a test database. Verify each tool call round-trips correctly: input → MCP call → response matches expected shape. Auth tested: valid key succeeds, invalid key rejected, missing key rejected.

**Auth / Identity** — integration tested. Verify: signup creates user; login returns session token; invalid password rejected; API key generation and revocation; agent requests with valid/invalid keys.

## Implementation Log

### Issue 13 — Skill Registry (completed 2026-06-19)

Humans manage prompt-based skills via the web UI; agents load them via MCP. Five default skills seeded on first use.

- **Prisma schema** (`prisma/schema.prisma`): Added `Skill` model (id, name unique slug, description, prompt, createdAt, updatedAt) and `SkillFile` model (id, skillId cascade FK, name, content, createdAt; unique on [skillId, name]). Schema pushed and client regenerated.
- **Skill service** (`lib/skills/skill-service.ts`): `Skill` and `SkillFile` interfaces; `Db` interface for testability; `createSkill`, `getSkillByName`, `getSkillById`, `listSkills`, `updateSkill`, `deleteSkill`, `addSkillFile`, `getSkillWithFiles`, `deleteSkillFile`.
- **TDD tests** (`lib/skills/skill-service.test.ts`): 16 integration tests across 7 suites: `createSkill` (all fields, empty defaults), `getSkillByName` (found/null), `getSkillById` (found/null), `listSkills` (array/includes created), `updateSkill` (updates description+prompt, null on missing), `deleteSkill` (removed from store), `addSkillFile + getSkillWithFiles` (attaches file, returns skill+files, null on missing, empty files array), `deleteSkillFile` (removes file).
- **API routes**: `GET/POST /api/skills` (list with auto-seed, create — human session); `GET/PATCH/DELETE /api/skills/[id]` (detail with files, update, delete — human session); `POST /api/skills/[id]/files` (add supporting file); `DELETE /api/skills/[id]/files/[fileId]` (remove file).
- **Seed** (`lib/skills/seed-skills.ts`): `seedDefaultSkills` idempotently seeds 5 default skills on first GET /api/skills call: `to-prd`, `to-issues`, `grill-with-docs`, `tdd`, `improve-codebase-architecture` — each with a full Forge-MCP-adapted prompt.
- **Skills UI** (`app/skills/page.tsx`): Lists all skills (name, description, last-updated); inline create form with name, description, and prompt fields; links to detail page.
- **Skill detail UI** (`app/skills/[id]/page.tsx`): Shows skill name, description, primary prompt; inline edit form; delete with confirmation; supporting files section with add/remove per file.
- **MCP tools** (`mcp/server.ts`): `list_skills()` — returns `[{ name, description }]` (no prompt, agents call `get_skill` to load); `get_skill(name)` — returns `{ skill: { name, prompt, ... }, files: [{ name, content }, ...] }`; isError on unknown name. Agents cannot create, update, or delete skills via MCP (write tools not exposed).
- **MCP tests** (`mcp/server.test.ts`): Extended `makePgClient` with `skill` and `skillFile` table implementations; cleanup in `after()`; 6 new integration tests across 2 suites: `list_skills` (returns name+description, excludes prompt), `get_skill` (primary prompt + files, empty files, isError on unknown).
- **Test count**: 200/200 pass; `tsc --noEmit` clean.

### Issue 12 — MCP Gateway: Diffs (completed 2026-06-19)

Extended the MCP server with three diff tools and validated the existing `add_comment` / `list_comments` anchor handling for `diff_line` targets.

- **MCP tools added** (`mcp/server.ts`): Imported `uploadDiff`, `getDiff`, `listDiffsByIssue` from `lib/diffs/diff-service.ts`. Added three tools: `upload_diff(title, description?, branch, diff_text, issue_id)` — uploads a diff artifact linked to an issue, records agentLabel as authorLabel; `get_diff(id)` — returns full diff with metadata and raw diff text, throws isError on missing; `list_diffs(issue_id)` — returns all diffs for an issue in chronological order.
- **TDD tests** (`mcp/server.test.ts`): Extended `makePgClient` with a `diff` table implementation (create, findUnique, findMany). Added diff cleanup to `after()`. Added 10 new integration tests across 4 suites: `upload_diff` (returns id/title/branch/diffText/authorLabel, stores optional description); `get_diff` (returns all fields by id, isError on unknown id); `list_diffs` (chronological order, empty array, isolation across issues); `add_comment and list_comments on diff lines` (adds diff line comment with file_path anchor, list_comments filters by anchor, isolation across diffs).
- **Test count**: 179/179 pass; `tsc --noEmit` clean.

### Issue 11 — MCP Gateway: Documents (completed 2026-06-19)

Extended the MCP server with four document tools, giving agents full document lifecycle management through MCP.

- **`Document` interface extended** (`lib/documents/document-service.ts`): Added `versionId: string` to the `Document` interface and populated it from `version.id` in `createDocument`, `getDocument`, `getDocumentAtVersion`, and `updateDocument`. Agents need `versionId` as the `target_id` when adding inline comments to document sections via `add_comment`.
- **MCP tools added** (`mcp/server.ts`): Imported `createDocument`, `getDocument`, `getDocumentAtVersion`, `updateDocument`, `listDocumentsByIssue`. Added four tools: `create_doc(title, content, issue_id)` — creates a document linked to an issue, returns document with `versionId`; `get_doc(id, version?)` — returns latest version or a specific snapshot; `update_doc(id, content)` — appends a new version, prior versions unchanged; `list_docs(issue_id)` — returns all documents linked to an issue.
- **TDD tests** (`mcp/server.test.ts`): Extended `makePgClient` with `document`, `documentVersion`, and `documentIssueLink` table implementations. Added `TEST_DOC_ISSUE_ID` constant and document cleanup in `after`. Added 8 new integration tests across 4 suites: `create_doc` (returns id/title/content/versionNumber/versionId), `get_doc` (latest version, specific version, isError on missing), `update_doc` (version 2 returned, v1 unchanged), `list_docs` (two docs for issue, empty array).
- **Test count**: 169/169 pass; `tsc --noEmit` clean.

### Issue 10 — MCP Gateway: Issues and Comments (completed 2026-06-19)

Foundational MCP server giving agents access to the issue tracker and comment system via the Model Context Protocol.

- **Dependencies**: Added `@modelcontextprotocol/sdk ^1.29.0` and `zod ^4.4.3` to package.json.
- **MCP server factory** (`mcp/server.ts`): `createMcpServer(db, agentLabel)` builds an `McpServer` with 7 tools: `list_issues` (optional column filter), `get_issue`, `create_issue`, `update_issue`, `move_issue` (state machine enforced; invalid transitions returned as `isError`), `list_comments` (optional diff-line or document-section anchor), `add_comment` (records agentLabel as author, no userId). Thin translation layer — all business logic lives in existing services.
- **Entry point** (`mcp/index.ts`): Stdio transport server. Reads `MCP_API_KEY` env var; calls `findActiveApiKey` to validate; exits with error on missing or revoked key. Connects authenticated `McpServer` to `StdioServerTransport`.
- **TDD tests** (`mcp/server.test.ts`): 15 integration tests using `InMemoryTransport` + real PostgreSQL (pg pool). Covers: `list_issues` (all/column-filtered), `create_issue` (default column/specified column), `get_issue` (found/not-found isError), `update_issue`, `move_issue` (valid/invalid-transition isError), `add_comment` (agent author, no userId), `list_comments` (two comments chronological/empty target), `auth: findActiveApiKey` (valid key/invalid key/empty string).
- **Test script**: Updated to `'lib/**/*.test.ts' 'mcp/**/*.test.ts'` to include MCP tests.
- **Test count**: 161/161 pass; `tsc --noEmit` clean.

### Issue 8 — Diff Upload and View (completed 2026-06-19)

Upload and view PR diffs as first-class immutable artifacts. Each diff carries structured metadata (title, description, branch) plus raw unified diff text. The viewer renders the diff with syntax highlighting via diff2html. Multiple diffs can be linked to one issue; re-uploading creates a new artifact, never mutates the first.

- **Prisma schema** (`prisma/schema.prisma`): Added `Diff` model with `id`, `title`, `description`, `branch`, `diffText`, `issueId`, `authorUserId?`, `authorLabel`, `createdAt`. Schema pushed and client regenerated.
- **Diff service** (`lib/diffs/diff-service.ts`): `Diff` interface; `UploadDiffInput`; `Db` interface for testability; `uploadDiff` (creates diff record), `getDiff` (returns by id or null), `listDiffsByIssue` (returns in chronological order).
- **TDD tests** (`lib/diffs/diff-service.test.ts`): 10 integration tests across 3 suites: `uploadDiff` (creates with all fields, agent author, default empty description, immutability check); `getDiff` (returns full fields, null on missing); `listDiffsByIssue` (chronological order, empty list, isolation by issueId, multiple artifacts per issue).
- **API routes**: `POST /api/diffs` (dual auth: human session or agent Bearer; validates title/branch/diffText/issueId; returns 201). `GET /api/diffs/[id]` (human session; 404 on missing). `GET /api/issues/[id]/diffs` (human session; 404 if issue missing).
- **Issue detail UI** (`app/board/[id]/page.tsx`): Diffs section between Documents and Comments; fetches diffs on load; "+ Upload Diff" inline form with title, branch, description, and diff textarea; optimistic append on submit; each diff links to viewer showing branch name, author, and timestamp.
- **Diff viewer** (`app/diffs/[id]/page.tsx`): Fetches diff by id; renders metadata header (title, branch badge, description, author, timestamp); diff body rendered via `diff2html` (`html()` imported dynamically) with line-by-line output format and local CSS bundle; back-link to parent issue.
- **Test count**: 142/142 pass; `tsc --noEmit` clean.

### Issue 7 — Document Inline Comments (completed 2026-06-19)

Inline comments anchored to character offset ranges in specific document versions. Commented sections are highlighted in the viewer; clicking reveals the thread. Humans can resolve comments.

- **Prisma schema** (`prisma/schema.prisma`): Added `anchorStart Int?` and `anchorEnd Int?` to the Comment model. Schema pushed and client regenerated.
- **Comment service** (`lib/comments/comment-service.ts`): Extended `Comment` interface with `anchorStart`/`anchorEnd` fields. Extended `AddCommentInput` to accept optional anchor fields. Extended `listComments` to accept an optional `Anchor { startOffset, endOffset }` parameter that filters by anchor. Added `resolveComment(db, id)` — sets `status = 'resolved'`. Extended `Db` interface with `comment.update` and anchor filtering on `comment.findMany`.
- **TDD tests** (`lib/comments/comment-service.test.ts`): 6 new integration tests across two new suites: add inline comment with anchor, null anchor for issue comments, anchor filter returns only matching range, no-anchor returns all, resolve sets status to resolved, resolved status visible in listComments. `makePgClient` extended with `update` method and anchor-aware `findMany`.
- **API routes**: `GET /api/documents/[id]/comments?versionId=X[&anchorStart=N&anchorEnd=M]` — list inline comments, optionally filtered by anchor. `POST /api/documents/[id]/comments` — add inline comment (human session or agent Bearer; requires versionId, anchorStart, anchorEnd, body). `PATCH /api/comments/[id]` — resolve a comment (human session; body `{ status: "resolved" }`).
- **Document viewer** (`app/documents/[id]/page.tsx`): Mouse-up handler captures selection as character offsets. Floating comment form appears on selection. `renderAnnotatedContent` splits text at all comment boundaries and wraps matched segments in `<mark>` elements (yellow for open, gray/dim for resolved, bright yellow when active). Clicking a highlighted segment reveals the thread panel below the content. Each comment in the thread has a Resolve button that calls `PATCH /api/comments/[id]` and updates state optimistically.
- **Test count**: 132/132 pass; `tsc --noEmit` clean.

### Issue 6 — Document Store: Versioning (completed 2026-06-19)

Append-only version history for documents. Every update creates a new version snapshot; prior versions are never mutated. The viewer exposes a version history sidebar, a version selector, and a diff view.

- **Service layer** (`lib/documents/document-service.ts`): Added `updateDocument` (appends next version, updates Document.updatedAt), `getDocumentAtVersion` (fetches a specific version by number), `listDocumentVersions` (returns all versions in ascending order with author and timestamp), `diffDocumentVersions` (returns unified diff between any two versions). Extended `Db` interface with `document.update`, `documentVersion.findFirst` supporting optional `versionNumber` in where clause, and `documentVersion.findMany`. Added `computeUnifiedDiff` pure helper (LCS-based Myers diff, context hunks, unified diff format).
- **TDD tests** (`lib/documents/document-service.test.ts`): 17 new integration tests covering: version 2 created on update, v1 content unchanged, null for nonexistent doc/version, successive increments, getDocument returns latest after update, getDocumentAtVersion v1/v2/missing/nonexistent doc, listDocumentVersions order/author/timestamp/empty, diffDocumentVersions correct diff/identical/nonexistent doc/missing version. Updated `makePgClient` to support new db methods.
- **API routes**: `GET /api/documents/[id]?version=N` returns content at that version (400 on bad param, 404 on missing). `GET /api/documents/[id]/versions` lists all versions. `POST /api/documents/[id]/versions` creates a new version (dual auth). `GET /api/documents/[id]/diff?from=N&to=M` returns `{ diff: string }`.
- **Document viewer** (`app/documents/[id]/page.tsx`): Version history sidebar (clickable versions sorted newest-first), View/Compare tabs, diff view with from/to selectors and syntax-highlighted output (green additions, red deletions, blue hunk headers).
- **Test count**: 126/126 pass; `tsc --noEmit` clean.

### Issue 5 — Document Store: Create and Read (completed 2026-06-19)

First-class Document entities with versioned storage, issue linking, and a read-back UI.

- **Prisma schema**: `Document` (id, title, createdAt, updatedAt), `DocumentVersion` (id, documentId, versionNumber, content, authorUserId, authorLabel, createdAt; unique on [documentId, versionNumber]), `DocumentIssueLink` (compound PK [documentId, issueId]; cascade deletes). Schema pushed via `prisma db push`.
- **Document service**: `lib/documents/document-service.ts` — `createDocument` (creates Document + version 1 + issue link), `getDocument` (fetches doc with latest version content), `listDocumentsByIssue` (follows DocumentIssueLink join), `linkDocumentToIssue` (idempotent upsert via `ON CONFLICT DO NOTHING`). Db interface pattern matches prior slices for testability.
- **TDD tests**: `lib/documents/document-service.test.ts` — 11 integration tests against real PostgreSQL covering: create with version 1, author recorded, link visible in list, full field fetch, null for missing id, empty list, cross-issue isolation, fields on list items, multi-issue linking, idempotent link.
- **API routes**: `POST /api/documents` (dual auth: human session or agent Bearer; validates title/content/issueId; returns 201); `GET /api/documents/[id]` (human session required; 404 on missing); `GET /api/issues/[id]/documents` (lists docs for an issue; 404 if issue missing).
- **Issue detail UI** (`app/board/[id]/page.tsx`): Documents section above comments; fetches linked docs on load; "+ New Document" inline form with title + content textarea; optimistic append on create; each doc links to viewer.
- **Document viewer** (`app/documents/[id]/page.tsx`): fetches doc via API; shows title, version badge, last-updated timestamp, content rendered as preformatted monospace text.
- **Test count**: 109/109 pass; `tsc --noEmit` clean.

### Issue 4 — Issue Comments (completed 2026-06-19)

Threaded comment system on issues. Establishes the shared polymorphic Comment data model reused by document and diff comments in later slices.

- **Comment model**: `prisma/schema.prisma` — `Comment` with `targetType` (issue/document_section/diff_line), `targetId`, `body`, `authorUserId` (null for agents), `authorLabel`, `status` (open/resolved), `createdAt`. Schema pushed via `prisma db push`.
- **Comment service**: `lib/comments/comment-service.ts` — `addComment`, `listComments`; accepts a Db interface matching Prisma shape for testability. 7 TDD integration tests against real PostgreSQL covering human author, agent author (no userId), chronological ordering, empty results, cross-targetType isolation, and full field verification.
- **API route**: `app/api/issues/[id]/comments/route.ts` — `GET` (list, human session required) + `POST` (add, dual auth: human session or agent Bearer token). Returns 404 when issue not found, 400 when body missing, 401 when unauthenticated.
- **Issue detail UI** (`app/board/[id]/page.tsx`): comment thread renders in chronological order with author name and timestamp; inline add-comment form with textarea and submit button; new comment appends optimistically without reload; agent label shown when no userId.
- **Test count**: 98/98 pass; `tsc --noEmit` clean.

### Issue 3 — Issue Tracker Kanban and State Machine (completed 2026-06-19)

Six-column kanban board with server-enforced state machine, issue CRUD, and a detail/move UI.

- **State machine**: `lib/issues/state-machine.ts` — pure `canTransition`/`transition` functions; 39 TDD unit tests covering every valid/invalid pair and same-column no-ops. Invalid transitions throw `Error("Invalid transition: FROM → TO")`.
- **Issue service**: `lib/issues/issue-service.ts` — `createIssue`, `listIssues`, `getIssue`, `updateIssue`, `moveIssue`; 12 integration tests against real PostgreSQL via pg pool.
- **Prisma schema**: `Issue` model with `id`, `title`, `description`, `column`, `createdAt`, `updatedAt`. `column` is stored as a plain string enum value (`BACKLOG` / `TODO` / `IN_PROGRESS` / `NEEDS_HUMAN_REVIEW` / `NEEDS_AGENT_REVIEW` / `DONE`); transitions enforced in the service layer, not at DB level.
- **API routes**: `GET/POST /api/issues`, `GET/PATCH /api/issues/[id]`, `POST /api/issues/[id]/move`. All require NextAuth session. Invalid column names → 400; invalid transitions → 422; not found → 404.
- **Board UI** (`app/board/page.tsx`): client component; fetches all issues on load; renders six columns with issue count badges; Needs Human/Agent Review columns use amber styling to stand out; Done column uses green. `+ New Issue` form creates issues defaulting to Backlog.
- **Detail UI** (`app/board/[id]/page.tsx`): client component; shows title, description, column badge, and move buttons for every valid next column. Move errors shown inline. Back-link to board.
- **Test count**: 91/91 pass (`tsc --noEmit` clean).

### Issue 2 — Human Auth and API Keys (completed 2026-06-19)

Full end-to-end authentication slice for humans and agents. Key decisions:

- **Bearer extraction**: `lib/auth/bearer.ts` — pure `extractBearer(header)` function, TDD-tested in isolation (7 cases).
- **Password layer**: `lib/auth/password.ts` — bcrypt hash/verify, salt rounds = 12. Unit-tested.
- **User service**: `lib/auth/users.ts` — `createUser`, `findUserByEmail`, `validateUserCredentials`. Integration-tested against real PostgreSQL via pg pool.
- **API key crypto**: `lib/auth/api-keys.ts` — `generateApiKey` (`frg_` prefix + 32 random bytes hex), `hashApiKey` (SHA-256), `verifyApiKey` (timing-safe compare). Unit-tested.
- **API key service**: `lib/auth/api-key-service.ts` — `createApiKey`, `listApiKeys`, `revokeApiKey`, `findActiveApiKey`. Integration-tested against real PostgreSQL.
- **NextAuth config**: `lib/auth/nextauth-config.ts` — credentials provider wired to `validateUserCredentials`; JWT strategy; session callback adds `user.id` from token.
- **Session type augmentation**: `types/next-auth.d.ts` — extends `Session.user` with `id: string` and `JWT` with `id?: string`.
- **Middleware**: `middleware.ts` — `getToken` (Edge-compatible JWT validation) protects all routes except `/login`, `/signup`, `/api/auth/*`, `/api/agent/*`; API routes get 401, page routes get redirect to `/login?callbackUrl=…`.
- **API routes**: signup (`POST /api/auth/signup`), NextAuth handler, API key list/create (`/api/account/api-keys`), revoke (`DELETE /api/account/api-keys/[id]`), agent ping (`GET /api/agent/ping`).
- **UI**: `/login` (NextAuth `signIn`), `/signup` (POST to signup route), `/account` (list/generate/revoke keys; new key shown once then dismissed).
- **SessionProvider**: wrapped in `app/providers.tsx` client component; injected in root layout.
- **Test count**: 40/40 pass; `tsc --noEmit` clean.

### Issue 1 — Project Scaffold (completed 2026-06-18)

Initialized the Next.js 16 App Router monorepo with TypeScript, Prisma 7, Tailwind CSS 3, and PostgreSQL. Key decisions made during implementation:

- **Test runner**: Node.js built-in `node:test` with `--experimental-strip-types` (Node 22) instead of Vitest. esbuild native binaries SIGILL/SIGFAULT on the ARM64 sandbox CPU; the built-in runner requires no compilation toolchain.
- **Build mode**: `next build --webpack` with WASM SWC (`@next/swc-wasm-nodejs`). Native SWC and Turbopack crash on this ARM64 variant; WASM fallback works with webpack bundler. Set `NEXT_TEST_WASM_DIR` in `.env.local` to point at the pre-installed WASM package.
- **CSS**: Tailwind CSS v3 (pure JS PostCSS) instead of v4. Tailwind v4's `@tailwindcss/oxide` (Rust native) also segfaults on this CPU.
- **Prisma 7**: Requires `prisma.config.ts` for datasource URL — `url` is no longer accepted in `schema.prisma`.
- **TDD**: `lib/api/health.ts` extracted as a pure function testable without Next.js bindings; `lib/api/health.test.ts` uses `node:test` + `assert`.

## Out of Scope

- Granular reviewer assignment (specific person or role per document/issue) — v2
- Push notifications to agents (webhooks, events) — v2
- GitHub / GitLab integration (pull live PRs, sync comments) — v2
- Multi-tenant support (multiple isolated projects/teams) — v2
- Role-based access control (Owner, Reviewer, Contributor roles) — v2
- Real-time collaboration (live cursor, live updates) — v2
- Mobile UI — v2
- Audit log / compliance trail — v2

## Further Notes

- The Project Context (`CONTEXT.md`) is the primary mechanism for agent orientation. Keeping it under 1000 tokens is a product discipline, not just a technical constraint — agents that load bloated context perform worse.
- Skills in Forge mirror the skills in this Claude Code project (`.claude/skills/`), adapted to interact with Forge via MCP rather than the filesystem. The default skill set ships with: `to-prd`, `to-issues`, `grill-with-docs`, `tdd`, `improve-codebase-architecture`.
- The Needs Agent Review column implies the reviewing agent starts with a reset context — this is intentional. The reviewing agent reads the issue, loads the document or diff, reads comments, and reviews without inheriting the producing agent's assumptions.
- Diffs are immutable once uploaded. A revised diff is a new upload. This preserves the review history of each iteration.
