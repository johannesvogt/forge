## What to build

Threaded comment system on issues. Humans and agents can add comments; the issue detail view shows the full comment history in chronological order. Author identity is shown as the human's name or the agent's API key label.

This slice establishes the shared Comment data model (polymorphic target) that document and diff comments will reuse in later slices.

## Acceptance criteria

- [ ] Human can add a comment to an issue from the issue detail view
- [ ] Comment thread renders in chronological order with author name and timestamp
- [ ] Human author shown as their display name; agent author shown as API key label
- [ ] Comment persists on page reload
- [ ] Comment Engine integration tests pass: add comment, list comments, correct author identity for human and agent

## Blocked by

- #3 Issue tracker — kanban + state machine
