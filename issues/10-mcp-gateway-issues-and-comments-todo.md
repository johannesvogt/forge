## What to build

The MCP server that gives agents access to issues and comments. This is the foundational agent interface — all subsequent MCP slices extend this server. Runs as a separate TypeScript process alongside the Next.js app. Authenticates via Bearer API key in connection headers.

No business logic in the gateway — it translates MCP tool calls to internal service calls and returns structured responses.

MCP tools delivered in this slice:
```
list_issues(column?, assignee?)
get_issue(id)
create_issue(title, description, column?)
update_issue(id, title?, description?)
move_issue(id, column)
list_comments(target_type, target_id, anchor?)
add_comment(target_type, target_id, body, anchor?)
```

## Acceptance criteria

- [ ] MCP server starts and accepts connections
- [ ] API key in connection header authenticates agent; missing/invalid key closes connection with auth error
- [ ] `list_issues` returns issues filtered by column and/or assignee
- [ ] `create_issue` creates an issue and returns its ID
- [ ] `move_issue` enforces the state machine; invalid transition returns error
- [ ] `add_comment` on an issue records agent as author (API key label)
- [ ] MCP Gateway integration tests: each tool round-trips correctly; auth scenarios covered

## Blocked by

- #2 Human auth + API keys
- #4 Issue comments
