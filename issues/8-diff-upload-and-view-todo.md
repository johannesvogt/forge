## What to build

Upload and view PR diffs as first-class artifacts. A Diff is uploaded with structured metadata (title, description, branch name, linked issue ID) plus raw unified diff text. The diff viewer renders it with syntax highlighting. Diffs are immutable — a revised diff is a new upload.

Uses `diff2html` for rendering.

## Acceptance criteria

- [ ] Human (or agent via API) can upload a diff with title, description, branch name, and linked issue ID
- [ ] Uploaded diff appears in the linked issue's detail view under a Diffs section
- [ ] Diff viewer renders the unified diff with syntax highlighting and file headers
- [ ] Multiple diffs can be linked to one issue (each upload is a separate immutable artifact)
- [ ] `GET /api/diffs/:id` returns diff metadata + raw diff text
- [ ] Uploading a second diff does not modify the first

## Blocked by

- #3 Issue tracker — kanban + state machine
