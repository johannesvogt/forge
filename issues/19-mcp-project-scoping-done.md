# MCP: project scoping

## What to build

Update the MCP layer so that all tool calls are automatically scoped to the project determined by the agent's API key. The project is fixed at process startup — there is no mechanism to change it mid-session.

- `createMcpServer(db, agentLabel, projectId)` — receives `projectId` and forwards it to all service calls
- `mcp/index.ts` — after `findActiveApiKey`, extract `projectId` and pass to `createMcpServer`; exit with a clear error if `projectId` is missing (revoked or legacy key)
- All tool handlers (`list_issues`, `create_issue`, `move_issue`, `update_issue`, `list_comments`, `add_comment`, `create_doc`, `get_doc`, `update_doc`, `list_docs`, `upload_diff`, `get_diff`, `list_diffs`, `list_skills`, `get_skill`, `get_project_context`, `update_project_context`) forward `projectId` to the respective service

Update existing MCP server tests. Add tests verifying a server instantiated with project A's ID cannot see data belonging to project B.

## Acceptance criteria

- [ ] `createMcpServer` signature includes `projectId`
- [ ] All 17 MCP tools pass `projectId` through to the service layer
- [ ] MCP entry point exits with a non-zero code and descriptive error if `projectId` is absent on the resolved key
- [ ] Existing MCP server tests updated and passing
- [ ] Cross-project isolation test: two servers with different `projectId`s; tool call on server A does not return data created via server B
- [ ] `tsc --noEmit` passes

## Blocked by

- #17 project-scoped API keys
- #18 domain services: project scoping
