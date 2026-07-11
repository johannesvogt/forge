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
        "command": "echo 'Forge MCP connected. Follow the project instructions: call get_project_context and list_skills before doing anything else.'"
      }]
    }]
  }
}
```

`permissions.allow` removes approval prompts for all Forge MCP tools. The `SessionStart` hook reinforces the project startup instructions described below.

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

#### Load the Forge Project Context at every agent startup

The Forge **Project Context** is the canonical glossary and project orientation stored in Forge. Keep it in Forge and load it through MCP at the beginning of every agent session so the agent does not work from a stale local copy.

Codex reads `AGENTS.md` from the repository root before it starts work. Create `AGENTS.md` in the project where the agent will work:

```markdown
# Forge startup

Before doing any work or answering the user's request:

1. Call the Forge MCP tool `get_project_context` and treat the returned Project Context as the canonical source for domain language and project orientation.
2. Call the Forge MCP tool `list_skills` to discover the workflows available for this project.
3. If `get_project_context` fails, stop and report the MCP connection or authentication error instead of continuing without the Project Context.
```

Claude Code reads `CLAUDE.md`, not `AGENTS.md`. To share the same instructions without duplicating them, create `CLAUDE.md` beside `AGENTS.md` and import it:

```markdown
@AGENTS.md
```

The resulting project setup is:

```text
your-project/
├── AGENTS.md
├── CLAUDE.md
├── .mcp.json
└── ...
```

Launch Claude Code or Codex from this project directory. Both tools load their project instruction files once at the start of each new session; the instruction then causes the agent to fetch the current Project Context from Forge. Start a new session after changing either instruction file.

To verify the setup, start each agent and ask it to state which project instructions it loaded and summarize the Forge Project Context. Confirm that it calls `get_project_context` rather than reading a local `CONTEXT.md`.

> Project instruction files guide model behavior but are not a hard execution hook. Claude's `SessionStart` hook above provides an additional reminder; for both agents, verify the MCP call when validating a new project setup.

Official references: [Claude Code project memory](https://docs.anthropic.com/en/docs/claude-code/memory) and [Codex custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md).

---

### Step 4 — Set up the AFK scripts

The AFK script runs Claude Code or Codex in a loop, with each iteration picking up and completing one issue.

Copy the script to your project root:

```bash
cp /path/to/forge/agent-scripts/afk.sh .
chmod +x afk.sh
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
./afk.sh claude 10

# Codex
./afk.sh codex 10

# Only implement issues from TODO
./afk.sh claude --todo-only 10

# Only review issues from Needs Agent Review
./afk.sh codex --review-only 10

# Select a model for Claude Code
./afk.sh claude --model sonnet --todo-only 10

# Select a model for Codex
./afk.sh codex --model gpt-5.4 --review-only 10
```

Without a filter flag, each iteration prioritizes **Needs Agent Review**, then **TODO**. Use `--todo-only` to restrict the agent to implementation work in **TODO**, or `--review-only` to restrict it to review work in **Needs Agent Review**. The flags are mutually exclusive and can be placed before or after the positive integer iteration count.

Use `--model <model>` to override the agent's configured model for every iteration. For Claude Code, the value is passed to its top-level `--model` option and may be an alias such as `sonnet`, `opus`, `haiku`, or `fable`, or a full model name. For Codex, it is passed to `codex exec --model`. Omitting the option preserves the tool's configured default.

An implementation pass moves completed work to **Needs Agent Review**. A review pass moves it to **Done** or sends it back with feedback. The loop exits early when no eligible issues remain for the selected mode.
