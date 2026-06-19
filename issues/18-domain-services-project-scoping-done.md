# Domain services: project scoping

## What to build

Update all five domain services to accept and enforce `projectId`. Every read and write operation must be scoped to the given project — no cross-project data access is possible through the service interface.

Services to update: `issue-service`, `document-service`, `diff-service`, `skill-service`, `context-service`.

Also update `seedDefaultSkills` to accept `projectId` and write skills into the specified project.

Update all existing service tests. Add cross-project isolation tests: create data in project A, verify it is not returned when querying project B.

## Acceptance criteria

- [ ] All functions in `issue-service`, `document-service`, `diff-service`, `skill-service`, `context-service` accept `projectId` and scope all DB queries by it
- [ ] `seedDefaultSkills(db, projectId)` seeds skills into the specified project only
- [ ] `context-service` get/update scoped to `projectId`; no singleton fallback remains
- [ ] Existing tests updated to pass `projectId`
- [ ] Cross-project isolation tests: data created in project A not returned when querying project B, for each service
- [ ] `tsc --noEmit` passes

## Blocked by

- #15 project schema
