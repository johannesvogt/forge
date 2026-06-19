# Project service

## What to build

Implement `project-service` as a new deep module. It encapsulates all project lifecycle logic: creation (including seeding default skills and creating an empty Project Context), listing, fetching by slug, and deletion (relying on cascade for child cleanup).

Slug generation is part of this module: lowercase, spaces to hyphens, non-alphanumeric stripped. Uniqueness is enforced at the DB level; the service surfaces a domain error on conflict.

Include integration tests covering the full lifecycle.

## Acceptance criteria

- [ ] `createProject(db, { name, createdByUserId })` generates a slug, creates the project, seeds default skills into the project, and creates an empty ProjectContext for the project
- [ ] `listProjects(db)` returns all projects ordered by `createdAt` desc
- [ ] `getProject(db, slug)` returns a project by slug or null if not found
- [ ] `deleteProject(db, id)` removes the project; cascade removes all child issues, documents, diffs, skills, and project context
- [ ] Slug conflict produces a clear domain error (not a raw DB constraint error)
- [ ] Integration tests: create, list, get-by-slug (found + not found), delete cascade (child records gone), slug conflict
- [ ] `tsc --noEmit` passes

## Blocked by

- #15 project schema
