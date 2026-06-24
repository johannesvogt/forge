# Agent Scripts

Scripts for running autonomous agents against a Forge project.

## Available scripts

| Script | Agent |
|--------|-------|
| `afk-claude.sh` | Claude Code (via Docker sandbox) |

---

## afk-claude.sh

Runs Claude Code in a Docker sandbox in a loop. Each iteration picks up the highest-priority issue in the Forge board and works it to completion. The loop exits early if no issues are available.

### Prerequisites

**One-time sandbox setup** — the Docker sandbox must be initialised and logged in before the script will work. Run this manually and follow the prompts:

```bash
docker sandbox run claude
```

This sets up the sandbox environment and authenticates Claude. You only need to do this once per machine.

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
