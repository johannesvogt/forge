# Forge

Forge is an AI-first project management system where AI agents do the primary work and humans review, approve, and guide. Agents interact via MCP; humans interact via web UI.

## Language

### Work

**Issue**:
The primary unit of work. Everything an agent picks up, executes, and closes is an issue. Documents, diffs, and comments are artifacts produced while resolving an issue.
_Avoid_: Task, ticket, card, item

**Column**:
The state an issue occupies in the issue tracker. Issues move between columns as work progresses.
_Avoid_: Status, state, stage, lane

**Backlog**:
A column for issues that are known but not yet ready to be worked on.
_Avoid_: Icebox, parking lot

**Todo**:
A column for issues that are ready to be picked up by an agent or human.
_Avoid_: Ready, queued, up-next

**In Progress**:
A column for issues actively being worked on.
_Avoid_: Active, open, doing

**Needs Human Review**:
A column for issues awaiting approval from a human. Generates a corresponding issue if a document requires human sign-off.
_Avoid_: Pending review, awaiting approval, blocked

**Needs Agent Review**:
A column for issues awaiting review by a different agent than the one that produced the work. Agent context is reset for the review.
_Avoid_: Peer review, automated review

**Done**:
A column for issues that are complete and approved (or required no approval).
_Avoid_: Closed, resolved, complete

### Artifacts

**Document**:
A versioned artifact (PRD, architecture note, implementation note, design doc, etc.) produced by resolving an issue. Documents are first-class entities with full version history, referenced by many issues, and refined via new issues.
_Avoid_: File, artifact, attachment, page

**Version**:
A full snapshot of a document at a point in time. Every save creates a new version. Versions are diffable.
_Avoid_: Revision, draft, snapshot

**Diff**:
A PR diff uploaded to Forge as an artifact on an issue. Contains unified diff content plus metadata (title, description, linked issue, branch name). Supports line-level comments.
_Avoid_: PR, pull request, patch

**Comment**:
Feedback left on an issue, inline on a document section, or on a specific line of a diff. Comments drive agent iteration.
_Avoid_: Note, annotation, feedback, reply

**Skill**:
A markdown prompt (plus optional supporting format files) stored in Forge and served to agents via MCP. Agents load a skill to follow its instructions. Humans can create and edit skills via the web UI. Agents are read-only.
_Avoid_: Command, workflow, playbook, template

### Agents & Context

**Agent**:
An AI that interacts with Forge exclusively via the MCP interface. Agents pick up issues, create and iterate on documents and diffs, add comments, and maintain the Project Context.
_Avoid_: Bot, AI, assistant, worker

**Project Context**:
A single `CONTEXT.md` file per project. Contains the canonical glossary and essential project orientation. Small enough to load in one MCP call (~500–1000 tokens). Maintained by agents, editable by humans.
_Avoid_: Context file, knowledge base, readme, summary

**MCP Interface**:
The exclusive API surface through which agents interact with Forge. Provides tools for issues, documents, diffs, comments, skills, and project context.
_Avoid_: API, agent API, tool interface
