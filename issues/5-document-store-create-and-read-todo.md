## What to build

First-class Document entities that can be created, linked to an issue, and read back. A document has a title, markdown content, and a stable ID. Creating a document produces version 1. The issue detail view lists linked documents; clicking one opens the document viewer.

No versioning logic yet — that is slice #6. This slice proves the document entity, storage, and basic read path end-to-end.

## Acceptance criteria

- [ ] Human (or agent via API) can create a document with a title, markdown content, and a linked issue ID
- [ ] Document is listed on the linked issue's detail view
- [ ] Document viewer renders markdown content in a readable format
- [ ] Creating a document produces version 1 in the database
- [ ] `GET /api/documents/:id` returns document with current content
- [ ] Documents can be linked to additional issues (many-to-many join)

## Blocked by

- #3 Issue tracker — kanban + state machine
