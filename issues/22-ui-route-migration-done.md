# UI: route migration under /projects/[slug]/

## What to build

Move all existing resource pages under the `/projects/[slug]/` prefix. Every page consumes the project provided by the shared layout rather than making its own fetch. Update the navigation component to reflect the new URL structure.

Routes to migrate:
- `/board` → `/projects/[slug]/board`
- `/board/[id]` → `/projects/[slug]/board/[id]`
- `/documents` → `/projects/[slug]/documents`
- `/documents/[id]` → `/projects/[slug]/documents/[id]`
- `/diffs/[id]` → `/projects/[slug]/diffs/[id]`
- `/skills` → `/projects/[slug]/skills`
- `/skills/[id]` → `/projects/[slug]/skills/[id]`
- `/context` → `/projects/[slug]/context`

All API calls from these pages must include the resolved `projectId` when calling the resource APIs.

Old routes should no longer exist (no redirects needed — this is a dev-stage refactor).

## Acceptance criteria

- [ ] All eight page routes exist under `/projects/[slug]/` and render correctly
- [ ] Old top-level routes (`/board`, `/documents`, etc.) are removed
- [ ] Each page reads the project from the layout context without an extra fetch
- [ ] Navigation links updated to include the project slug
- [ ] Delete project button on a settings/project page triggers confirmation then `DELETE /api/projects/[slug]` and redirects to `/projects`
- [ ] `tsc --noEmit` passes

## Blocked by

- #21 UI: projects landing and creation
