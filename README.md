# Forge

AI-first project management system. Agents do the primary work via MCP; humans review and guide via web UI.

## Setup

### Prerequisites

- Node.js 22+
- PostgreSQL (or use `docker-compose.yml`)

### Install & run

```bash
npm install
cp .env.example .env
# edit .env — set DATABASE_URL
npx prisma migrate dev
npm run dev
```

App runs at `http://localhost:3000`.

## Configure Claude Code

Each Claude Code instance connects to Forge as an agent via the MCP server. The MCP server authenticates with a project-scoped API key.

### 1. Create an API key in Forge

1. Open Forge in the browser
2. Navigate to your project → **Settings → API Keys**
3. Create a key — copy it immediately (shown once)

### 2. Add MCP server to Claude Code

Create `.mcp.json` at the root of the project where the agent will work:

```json
{
  "mcpServers": {
    "forge": {
      "type": "http",
      "url": "http://${FORGE_HOST:-host.docker.internal}:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-key>"
      }
    }
  }
}
```

The URL defaults to `host.docker.internal` so it works inside a Claude sandbox. For non-sandbox sessions (Claude running directly on your machine), set `FORGE_HOST=localhost` in your shell profile:

```bash
# ~/.zshrc
export FORGE_HOST=localhost
```

### 3. Add Claude Code settings

Create `.claude/settings.json` at the root of the project where the agent will work:

```json
{
  "permissions": {
    "allow": ["mcp__forge__*"]
  },
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "echo 'Forge MCP connected. Call list_skills now to load available skill definitions before doing anything else.'"
      }]
    }]
  }
}
```

`permissions.allow` removes approval prompts for all Forge MCP tools. The `SessionStart` hook injects a reminder that tells Claude to call `list_skills` at the start of every session, so skill definitions are always loaded before work begins.

### 4. Authenticate the Docker sandbox and allow host access

Run this once from the project directory to log in and get an interactive shell inside the sandbox:

```bash
docker sandbox run claude
```

The sandbox name is printed on first startup. Once you have it, open a second terminal and allow the sandbox to reach Forge on localhost:

```bash
docker sandbox network proxy <sandbox-name> --allow-host localhost
```

Then verify the MCP connection from inside the sandbox:

```bash
claude mcp list
```

`forge` should appear with its tools listed.

### 5. Restart Claude Code

MCP servers load at startup. Restart the session after editing settings.

---

## Configure Codex

Codex connects to Forge the same way — via HTTP MCP with a project-scoped API key.

### 1. Create an API key in Forge

Same as Claude Code setup above (Settings → API Keys).

### 2. Set the API key as an env var

```bash
# ~/.zshrc
export FORGE_MCP_TOKEN=<your-api-key>
```

### 3. Add MCP server to Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.forge]
url = "http://host.docker.internal:3000/api/mcp"
bearer_token_env_var = "FORGE_MCP_TOKEN"
enabled = true
```

`host.docker.internal` lets the Codex sandbox reach Forge running on your machine. If running Codex outside a sandbox, use `localhost` instead.

### 4. Restart Codex

MCP servers load at startup. Restart the session after editing the config.

---

Each API key is scoped to one project. The agent can only read and write issues, documents, and diffs within that project.
