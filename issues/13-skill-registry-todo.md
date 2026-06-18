## What to build

A Skill Registry where humans manage prompt-based skills via the web UI and agents load them via MCP. A skill has a name (slug), a primary markdown prompt, and zero or more named supporting files (e.g. `ADR-FORMAT.md`). Skills are read-only for agents.

Seed the registry with the five default skills adapted for Forge: `to-prd`, `to-issues`, `grill-with-docs`, `tdd`, `improve-codebase-architecture`.

MCP tools:
```
list_skills()
get_skill(name)   — returns primary prompt + all supporting files
```

## Acceptance criteria

- [ ] Skills page in web UI lists all skills with name and description
- [ ] Human can create a skill with a name, primary prompt, and optional supporting files
- [ ] Human can edit a skill's prompt and supporting files
- [ ] Human can delete a skill
- [ ] `list_skills` MCP tool returns all skill names and descriptions
- [ ] `get_skill("to-prd")` returns primary prompt + supporting files in one response
- [ ] Five default skills are seeded on first run
- [ ] Agent cannot create, update, or delete skills via MCP (returns error)

## Blocked by

- #10 MCP Gateway — issues + comments
