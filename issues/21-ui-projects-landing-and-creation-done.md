# UI: projects landing and creation

## What to build

Introduce the projects landing page and project creation flow. This is the entry point into Forge — users land here, see all projects, and can create new ones.

- `/projects` — lists all projects as cards; each card links to `/projects/[slug]/board`
- `/projects/new` — form with a name field; shows a live slug preview; submits to `POST /api/projects`; redirects to `/projects/[slug]/board` on success
- Root `/` — redirects to `/projects`
- `/projects/[slug]/layout.tsx` — shared layout that resolves the project from the slug (404 if not found) and provides it to all child pages via context

## Acceptance criteria

- [ ] `/projects` renders a list of all projects; empty state shown when no projects exist
- [ ] Each project card links to `/projects/[slug]/board`
- [ ] `/projects/new` form validates name (non-empty); shows derived slug preview
- [ ] Successful creation redirects to the new project's board
- [ ] Slug conflict surfaces an error on the form
- [ ] `/` redirects to `/projects`
- [ ] `/projects/[slug]/layout.tsx` exists and returns 404 for unknown slugs
- [ ] `tsc --noEmit` passes

## Blocked by

- #20 project API routes
