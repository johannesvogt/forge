# Project schema

## What to build

Add `Project` as the top-level entity in the data model. Every other data-bearing entity gets a `projectId` foreign key with cascade delete. This is the foundation slice — no other project work can proceed without it.

Specific changes:
- Add `Project` model: `id` (cuid), `name`, `slug` (unique), `createdByUserId` (FK to User), `createdAt`, `updatedAt`
- Add `projectId` (FK to Project, cascade delete, required) to: `Issue`, `Document`, `Diff`, `Skill`, `ProjectContext`, `ApiKey`
- `ProjectContext`: remove the hard-coded `id: "singleton"` singleton; make `projectId` the unique identifier (`@@unique([projectId])`)
- `Skill.name` uniqueness: change from `@unique` to `@@unique([projectId, name])`
- Generate and apply the Prisma migration
- Drop all existing seed/test data — no legacy migration

## Acceptance criteria

- [ ] `Project` model exists in schema with all specified fields
- [ ] All six models (`Issue`, `Document`, `Diff`, `Skill`, `ProjectContext`, `ApiKey`) have a non-nullable `projectId` FK with cascade delete
- [ ] `ProjectContext` uniqueness is on `projectId`, not `id`
- [ ] `Skill` name uniqueness is scoped to `projectId`
- [ ] Migration file generated and applies cleanly against a fresh database
- [ ] `tsc --noEmit` passes with zero errors after schema change

## Blocked by

None — can start immediately
