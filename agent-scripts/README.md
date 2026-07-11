# Agent Scripts

Scripts for running autonomous agents against a Forge project.

## Available scripts

| Script | Agent |
|--------|-------|
| `afk.sh` | Claude Code or Codex (via `sbx`) |

---

## afk.sh

Runs either Claude Code or Codex via `sbx` in a loop. The first argument selects the agent, and every iteration picks up the highest-priority eligible Forge issue and works it to completion. Both agents use the same routing prompt.

### Prerequisites

Authenticate each agent you intend to use once from the project directory:

```bash
sbx run claude
sbx run codex
```

### Usage

```bash
./agent-scripts/afk.sh <claude|codex> [--todo-only | --review-only] [--model <model>] <iterations>
```

| Argument | Description |
|----------|-------------|
| `claude` or `codex` | Agent to run; this must be the first argument |
| `iterations` | Maximum number of issues to process before stopping; must be a positive integer |
| `--todo-only` | Only process issues in the TODO column |
| `--review-only` | Only process issues in the NEEDS_AGENT_REVIEW column |
| `--model <model>` | Override the selected agent's configured model |

Options may appear before or after `iterations`. `--todo-only` and `--review-only` are mutually exclusive.

### Examples

```bash
# Process up to 5 issues with Claude Code
./agent-scripts/afk.sh claude 5

# Process up to 5 issues with Codex
./agent-scripts/afk.sh codex 5

# Only implement TODO issues
./agent-scripts/afk.sh claude --todo-only 5

# Only review issues
./agent-scripts/afk.sh codex --review-only 5

# Select a Claude model alias
./agent-scripts/afk.sh claude --model sonnet 5

# Select a Codex model
./agent-scripts/afk.sh codex --model gpt-5.4 5
```

### Behaviour

- Each iteration runs a fresh session for the selected agent in the sandbox.
- With no filter flag, the agent prioritizes NEEDS_AGENT_REVIEW issues and then TODO issues.
- `--todo-only` restricts routing to TODO; `--review-only` restricts routing to NEEDS_AGENT_REVIEW.
- If no eligible issues are available for the selected mode, the script exits early.
- Claude Code sessions use `--permission-mode bypassPermissions`; the sandbox provides the isolation boundary.

### Model selection

For Claude Code, `--model` is passed to Claude's top-level `--model` option. Claude accepts aliases such as `sonnet`, `opus`, `haiku`, and `fable`, as well as full model names.

For Codex, `--model` is passed to `codex exec --model`.

If `--model` is omitted, the selected agent uses its configured default.

### Notes

- The script assumes the project's Forge MCP configuration is present and the Forge server is reachable from inside the sandbox at `host.docker.internal:3000`.
- For Claude Code, run `FORGE_HOST=localhost ./agent-scripts/afk.sh claude 5` to override the host for non-sandbox local use.
