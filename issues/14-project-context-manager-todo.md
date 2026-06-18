## What to build

The Project Context Manager stores and serves a single `CONTEXT.md` per project. Agents load it at session start for instant orientation; agents update it after completing significant work. Humans can edit it via a markdown editor in the web UI. Last-updated timestamp and author (human name or agent key label) are tracked and displayed.

Soft size limit: warn at 1000 tokens but do not block writes.

MCP tools:
```
get_project_context()
update_project_context(content)
```

## Acceptance criteria

- [ ] Project Context page in web UI renders current CONTEXT.md as editable markdown
- [ ] Human can save edits; last-updated shows human's name and timestamp
- [ ] `get_project_context` returns raw markdown content
- [ ] `update_project_context` replaces content and records agent key label + timestamp as author
- [ ] After agent update, web UI shows agent label as last author
- [ ] Write that exceeds 1000 tokens returns a warning in the response but still saves
- [ ] CONTEXT.md is pre-seeded with the project's current context on first run

## Blocked by

- #10 MCP Gateway — issues + comments
