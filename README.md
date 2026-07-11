# Forge

AI-first project management system. Agents do the primary work via MCP; humans review and guide via web UI.

![Project board](docs/images/screenshot-board.png)

---

## Quickstart

### Step 1 — Start Forge locally

**Prerequisites:** Node.js 22+, Docker (for the database)

#### 1a — Start the database

```bash
docker compose up -d
```

This starts PostgreSQL on port **5433**. Set `DATABASE_URL` in `.env.local`:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/forge
```

#### 1b — Install, migrate, and seed

```bash
npm install
npx prisma migrate dev
npx prisma db seed
```

The seed creates a default user:

| Field    | Value              |
|----------|--------------------|
| Email    | `admin@forge.local` |
| Password | `password`         |

Use these credentials to log in at `http://localhost:3000`.

To override before seeding:

```bash
SEED_EMAIL=you@example.com SEED_PASSWORD=secret npx prisma db seed
```

#### 1c — Start the app

```bash
npm run dev
```

App runs at `http://localhost:3000`.

---

### Step 2 — Create a project

Open `http://localhost:3000`, create a new project for the codebase you want to manage.

---

### Step 3 — Connect an agent

Pick Claude Code or Codex. Both connect via HTTP MCP with a project-scoped API key.

#### Create an API key

1. Open your project in Forge
2. Navigate to **Account → API Keys**
3. Enter a label, select your project, click **Generate key** — copy it immediately (shown once)

![API Keys](docs/images/screenshot-apikeys.png)

#### Option A: Claude Code

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

The URL defaults to `host.docker.internal` so it works inside a Claude sandbox. For non-sandbox sessions set `FORGE_HOST=localhost` in your shell profile:

```bash
# ~/.zshrc
export FORGE_HOST=localhost
```

Create `.claude/settings.json` at the same root:

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

`permissions.allow` removes approval prompts for all Forge MCP tools. The `SessionStart` hook tells Claude to call `list_skills` before doing anything else.

Authenticate `sbx` once from the project directory:

```bash
sbx run claude
```

Verify the MCP connection by starting Claude via `sbx`:

```bash
sbx run claude
```

Then prompt Claude:

```
Can you connect to the Forge MCP server and list the available tools?
```

Claude should respond with the list of Forge tools. Restart Claude Code after editing settings — MCP servers load at startup.

#### Option B: Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.forge]
url = "http://host.docker.internal:3000/api/mcp"
http_headers = { "Authorization" = "Bearer <your-api-key>" }
enabled = true
```

`host.docker.internal` lets the Codex sandbox reach Forge on your machine. Outside a sandbox, use `localhost` instead. Restart Codex after editing — MCP servers load at startup.

---

Each API key is scoped to one project. The agent can only read and write issues, documents, and diffs within that project.

---

### Step 4 — Set up the AFK scripts

The AFK scripts run agents in a loop, each iteration picking up and completing one issue.

Copy the scripts to your project root:

```bash
cp /path/to/forge/agent-scripts/afk-claude.sh .   # for Claude Code
cp /path/to/forge/agent-scripts/afk-codex.sh .    # for Codex
chmod +x afk-claude.sh afk-codex.sh
```

See [`agent-scripts/README.md`](agent-scripts/README.md) for prerequisites and usage.

---

### Step 5 — Create a PRD

Start a Claude Code (or Codex) session in your project and run:

```
I want to create a PRD using the forge 'to-prd' skill, after asking questions using the 'grill-with-docs' skill. The feature is <describe your feature here>.
```

The agent will interview you about the feature, sharpen the domain language, then publish a PRD document to Forge.

![PRD document](docs/images/screenshot-prd.png)

---

### Step 6 — Break the PRD into issues

Once the PRD is created, ask the agent:

```
Create issues for the PRD using the forge to-issues skill.
```

The agent will create one Forge issue per vertical slice, in dependency order, and link them back to the PRD.

---

### Step 7 — Run the AFK script

New issues land in **BACKLOG**. Move the ones you want worked to **TODO** in the Forge UI, then start the loop:

```bash
# Claude Code
./afk-claude.sh 10

# Codex
./afk-codex.sh 10
```

Each iteration claims one issue, implements it, and moves it to **Needs Agent Review**. A second agent pass reviews the work and moves it to **Done** or sends it back with feedback.
