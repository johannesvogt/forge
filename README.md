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

### 4. Restart Claude Code

MCP servers load at startup. Restart the session after editing settings.

### 5. Verify

Run `/mcp` in the Claude Code prompt — `forge` should appear in the list with its available tools.

---

Each API key is scoped to one project. The agent can only read and write issues, documents, and diffs within that project.
