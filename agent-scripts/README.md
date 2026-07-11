# Agent Scripts

Scripts for running autonomous agents against a Forge project.

## Available scripts

| Script | Agent |
|--------|-------|
| `afk-claude.sh` | Claude Code (via `sbx`) |
| `afk-codex.sh` | Codex (via `sbx`) |
| `afk-noprd.sh` | Claude Code (via Docker sandbox, local `issues/` dir workflow) |

---

## afk-claude.sh

Runs Claude Code via `sbx` in a loop. Each iteration picks up the highest-priority issue in the Forge board and works it to completion. The loop exits early if no issues are available.

### Prerequisites

**One-time sandbox setup** — run this manually to initialise and authenticate:

```bash
sbx run claude
```

You only need to do this once per project.

### Usage

```bash
./agent-scripts/afk-claude.sh <iterations>
```

| Argument | Description |
|----------|-------------|
| `iterations` | Maximum number of issues to process before stopping |

### Examples

```bash
# Process up to 5 issues
./agent-scripts/afk-claude.sh 5

# Run until the backlog is empty (large upper bound)
./agent-scripts/afk-claude.sh 100
```

### Behaviour

- Each iteration runs a fresh Claude Code session in the sandbox.
- The agent finds the highest-priority issue (TODO column), assigns itself, and works it.
- If no issues are available, the script exits early with a message.
- Sessions run with `--permission-mode bypassPermissions` — the sandbox provides the isolation boundary.

### Notes

- The script assumes the project's `.mcp.json` is configured and the Forge server is reachable from inside the sandbox (default: `host.docker.internal:3000`).
- Run `FORGE_HOST=localhost ./agent-scripts/afk-claude.sh 5` if you need to override the host for non-sandbox local use.

---

## afk-codex.sh

Equivalent to `afk-claude.sh` but runs Codex via the `sbx` command.

### Prerequisites

**One-time sandbox setup** — run this manually to initialise and authenticate:

```bash
sbx run codex
```

You only need to do this once per project.

### Usage

```bash
./agent-scripts/afk-codex.sh <iterations>
```

| Argument | Description |
|----------|-------------|
| `iterations` | Maximum number of issues to process before stopping |

### Examples

```bash
# Process up to 5 issues
./agent-scripts/afk-codex.sh 5

# Run until the backlog is empty (large upper bound)
./agent-scripts/afk-codex.sh 100
```

### Behaviour

- Each iteration runs a fresh Codex session in the sandbox.
- The agent finds the highest-priority issue (TODO column), assigns itself, and works it.
- If no issues are available, the script exits early with a message.
- Sessions run with `--approval-mode full-auto` — the sandbox provides the isolation boundary.

### Notes

- The script assumes the project's `.mcp.json` is configured and the Forge server is reachable from inside the sandbox (default: `host.docker.internal:3000`).

---

## afk-noprd.sh

Runs Claude Code in a Docker sandbox in a loop, working against a local `issues/` directory instead of the Forge board. No PRD/Forge MCP setup required.

### Prerequisites

**One-time sandbox setup** — run this manually and follow the prompts:

```bash
docker sandbox run claude
```

You only need to do this once per project.

### Usage

```bash
./agent-scripts/afk-noprd.sh <iterations>
```

| Argument | Description |
|----------|-------------|
| `iterations` | Maximum number of tasks to process before stopping |

### Examples

```bash
# Process up to 5 tasks
./agent-scripts/afk-noprd.sh 5
```

### Behaviour

- Each iteration runs a fresh Claude Code session in the sandbox, seeded with `progress.txt`.
- The agent picks the highest-priority task from the `issues/` directory that isn't marked done, implements it, runs tests/type checks, and appends its progress to `progress.txt`.
- Completed issue files are renamed with a `-done.md` suffix.
- If all tasks are complete, the script exits early with a message.

### Notes

- Requires an `issues/` directory of task files and a `progress.txt` file in the project root.
