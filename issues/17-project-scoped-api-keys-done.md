# Project-scoped API keys

## What to build

Update `api-key-service` so that API keys carry a `projectId`. This is the mechanism by which agents are bound to a project — the key determines scope, no extra parameter needed per MCP call.

- `createApiKey(db, userId, label, projectId)` — stores `projectId` on the key
- `findActiveApiKey(db, rawKey)` — returns `{ userId, label, projectId }`
- `listApiKeys(db, userId)` — returns keys with `projectId` included

Update all existing tests to cover the new field.

## Acceptance criteria

- [ ] `createApiKey` accepts and persists `projectId`
- [ ] `findActiveApiKey` returns `projectId` alongside `userId` and `label`
- [ ] `listApiKeys` includes `projectId` on each returned key
- [ ] Existing revoke behaviour unchanged
- [ ] All existing `api-key-service` tests updated and passing
- [ ] New tests: `findActiveApiKey` returns correct `projectId`; key for project A cannot be used to resolve project B
- [ ] `tsc --noEmit` passes

## Blocked by

- #15 project schema
