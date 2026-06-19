## What to build

Append-only version history for documents. Every update to a document creates a new version snapshot; prior versions are never mutated. The document viewer exposes a version history list and a diff view between any two versions.

Versions are stored as full snapshots. Diffs are computed on demand in unified diff format.

## Acceptance criteria

- [ ] Updating a document creates a new version; prior version content is unchanged
- [ ] Document viewer shows version history list (version number, timestamp, author)
- [ ] Human can select any version to view its content
- [ ] Human can select two versions and see a unified diff between them
- [ ] `GET /api/documents/:id?version=2` returns content at that version
- [ ] Version Store integration tests pass: create doc = version 1; update = version 2; fetch v1 returns original; diff v1↔v2 is correct

## Blocked by

- #5 Document store — create + read
