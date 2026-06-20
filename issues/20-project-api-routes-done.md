# Project API routes

## What to build

Add REST API routes for project management and update the API key routes to carry `projectId`.

New routes (user session auth required):
- `GET /api/projects` — list all projects
- `POST /api/projects` — create project (body: `{ name }`); delegates to `project-service`; returns project with slug
- `GET /api/projects/[slug]` — get single project or 404
- `DELETE /api/projects/[slug]` — delete project and all data; delegates to `project-service`

Updated routes:
- `POST /api/account/api-keys` — body now requires `projectId`
- `GET /api/account/api-keys` — response includes `projectId` per key

## Acceptance criteria

- [ ] `POST /api/projects` creates a project and returns `{ id, name, slug, createdAt }`
- [ ] `GET /api/projects` returns all projects
- [ ] `GET /api/projects/[slug]` returns the project or 404
- [ ] `DELETE /api/projects/[slug]` deletes the project and returns 204; subsequent GET returns 404
- [ ] `POST /api/account/api-keys` without `projectId` returns 400
- [ ] `GET /api/account/api-keys` includes `projectId` on each key
- [ ] All routes require user session auth; unauthenticated requests return 401
- [ ] `tsc --noEmit` passes

## Blocked by

- #16 project service
- #17 project-scoped API keys
