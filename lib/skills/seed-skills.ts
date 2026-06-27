import type { Skill } from './skill-service.ts';

export const DEFAULT_SKILLS: Array<{ name: string; description: string; prompt: string; files?: Array<{ name: string; content: string }> }> = [
  {
    name: 'to-prd',
    description: 'Turn the current conversation into a PRD and publish it as a standalone Forge document — no interview, just synthesis of what you\'ve already discussed.',
    prompt: `# to-prd

This skill takes the current conversation context and codebase understanding and produces a PRD. Do NOT interview the user — just synthesize what you already know.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the PRD, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better — the ideal number is one.

   Check with the user that these seams match their expectations.

3. Write the PRD using the template below, then call \`create_doc\` via MCP to publish it as a standalone document titled "PRD: <topic>". Omit \`issue_id\` — PRDs are standalone documents, not linked to any issue. Reply with the document ID so the user can find it under the Documents tab.

## PRD Template

### Problem Statement

The problem that the user is facing, from the user's perspective.

### Solution

The solution to the problem, from the user's perspective.

### User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

This list should be extremely extensive and cover all aspects of the feature.

### Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

### Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

### Out of Scope

A description of the things that are out of scope for this PRD.

### Further Notes

Any further notes about the feature.
`,
  },
  {
    name: 'to-issues',
    description: 'Break a plan, spec, or PRD into independently-grabbable issues using tracer-bullet vertical slices.',
    prompt: `# to-issues

You are breaking down a plan, spec, or PRD into independently-grabbable issues on the Forge issue tracker.

## Principles

- Each issue is a vertical slice: from data model → service → API → UI (where applicable).
- Issues should be executable by a single agent in one session.
- Order by dependency: later issues may reference earlier ones, but never the reverse.
- Each issue description includes: What to build, Acceptance criteria.

## Steps

1. Read the PRD or spec from the current context (or fetch it via \`get_doc\`).
2. Call \`get_project_info\` to get the project slug.
3. Identify the vertical slices — each one becomes one issue.
4. Call \`create_issue\` for each slice in dependency order.
5. Call \`add_dependency\` for each blocking relationship identified between the created issues.
6. Call \`add_comment\` on the parent issue (or PRD document) listing the created issues as markdown links: \`[#<id>: <title>](/projects/<slug>/board/<id>)\`.

## Issue types and annotation

When creating an issue whose primary work is writing code (feature implementation, bug fix, refactor), prefix the description with \`implementation-issue\` on its own line. If the issue is created in the context of a PRD, include a markdown link to the PRD document on the same line:

\`\`\`
implementation-issue, [PRD: <prd-title>](/projects/<slug>/documents/<doc-id>)

<rest of description>
\`\`\`

If there is no PRD context:

\`\`\`
implementation-issue

<rest of description>
\`\`\`

This annotation tells the agent picking up the issue to invoke the \`process-implementation-issue\` skill. The markdown link lets human reviewers navigate directly to the PRD from the issue.

Issues that are not implementation work (e.g. planning, writing a PRD, architecture review) must not carry this annotation.

## Output format

- One Forge issue per slice, created via \`create_issue\`
- Comment on the source document or issue with the full issue list
`,
  },
  {
    name: 'review-implementation-issue',
    description: 'Review an implementation issue in NEEDS_AGENT_REVIEW: verify code, tests, type checks, and feature behaviour. Pass, flag minor issues as follow-up refactoring, or return to TODO with blocking feedback.',
    prompt: `# review-implementation-issue

You are performing an agent code review on an implementation issue that is in the NEEDS_AGENT_REVIEW column.

## Steps

### 1. Claim the issue

- Call \`assign_issue(id)\` — this fails if another agent holds a non-stale lock.
- Call \`move_issue(id, "IN_PROGRESS")\`
- Call \`add_comment\` on the issue: "Picked up for agent review."

### 2. Load context

- Call \`get_project_info\` to get the project slug (needed for constructing links).
- Call \`get_issue(id)\` to read the full description, acceptance criteria, and dependency list.
- If the description references a PRD (e.g. "PRD: <name>"), call \`list_docs\` and \`get_doc\` to load it.
- Call \`list_comments\` on the issue and find the comment that contains the git diff or a reference to a diff artifact. If a diff ID is referenced, call \`get_diff\` to load it.

### 3. Review

Work through each of the following in order:

**3a. Code review**
Read the diff. Check that:
- The implementation matches the acceptance criteria in the issue (and PRD if present).
- No obvious bugs, security issues, or correctness problems.
- No unintended side-effects on other features.

**3b. Tests**
Run the project test suite. All tests must pass.

**3c. Type checks**
Run \`tsc --noEmit\` (or the project's type check command). Zero errors required.

If you encounter failures that are clearly pre-existing (present in the repo before this commit, unrelated to the changed code), do **not** block the review on them — but you **must** create a BACKLOG issue for each pre-existing problem you find. Use the same \`refactoring-issue\` prefix format. Do not silently note them in a comment and move on.

**3d. Feature verification**
Test the feature itself as far as possible given the environment (start the dev server if needed, exercise the golden path and key edge cases from the acceptance criteria).

If the diff touches any web UI code (React components, pages, styles, client-side logic), verify the change using Playwright:
- Start the dev server if not already running.
- Write and run a Playwright script that navigates to the affected UI, exercises the golden path, and asserts the acceptance criteria are visually met.
- Also check for obvious regressions in adjacent UI areas touched by the diff.
- A Playwright failure is a blocking issue (treat it the same as a failing test).

### 4. Verdict

#### Blocking issues found

If any of the following are true:
- Acceptance criteria not met
- Tests failing due to this commit
- Type errors introduced by this commit
- Correctness bug
- Security issue

Pre-existing failures (provably present before this commit) are **not** blocking — but each one requires a BACKLOG issue (see step 3c above).

Then:
1. Call \`unassign_issue(id)\`
2. Call \`add_comment\` on the issue with a detailed description of every problem found. The comment **must** start with:
   \`\`\`
   ISSUE DID NOT PASS REVIEW, PLEASE READ COMMENTS AND IMPLEMENT REQUESTED CHANGES
   \`\`\`
   Follow with a numbered list of specific, actionable problems.
3. Call \`move_issue(id, "TODO")\`

#### Minor non-functional issues only

If the implementation is correct and all checks pass, but there are non-functional concerns (naming, code style, minor structural improvements, test coverage gaps that don't affect correctness):

1. Call \`create_issue\` with column \`BACKLOG\` for each cluster of related minor issues. Prefix the description with:
   \`\`\`
   refactoring-issue

   Follow-up from [#<original-id>: <original-title>](/projects/<slug>/board/<original-id>)
   \`\`\`
   Then describe the specific changes needed.
2. Call \`add_comment\` on the original issue:
   "Minor non-functional issues found. Follow-up refactoring issue(s) created: [#<new-id>](/projects/<slug>/board/<new-id>) [, ...]. The implementation passes review."
3. Call \`unassign_issue(id)\`
4. Call \`move_issue(id, "DONE")\`

#### Clean pass

If everything is correct and there are no issues:
1. Call \`add_comment\` on the issue: "Agent review passed. All tests green, type check clean, acceptance criteria met."
2. Call \`unassign_issue(id)\`
3. Call \`move_issue(id, "DONE")\`
`,
  },
  {
    name: 'review-general-issue',
    description: 'Review a non-implementation issue in NEEDS_AGENT_REVIEW: verify the work matches acceptance criteria, flag blockers or create follow-up backlog items for minor issues.',
    prompt: `# review-general-issue

You are performing an agent review on a general issue (not an implementation or refactoring issue) that is in the NEEDS_AGENT_REVIEW column.

## Steps

### 1. Claim the issue

- Call \`assign_issue(id)\` — this fails if another agent holds a non-stale lock.
- Call \`move_issue(id, "IN_PROGRESS")\`
- Call \`add_comment\` on the issue: "Picked up for agent review."

### 2. Load context

- Call \`get_project_info\` to get the project slug (needed for constructing links).
- Call \`get_issue(id)\` to read the full description and acceptance criteria.
- Call \`list_docs\` and \`get_doc\` for any referenced documents or PRDs.
- Call \`list_comments\` on the issue to understand what work was done.

### 3. Review

Check the following:

**3a. Acceptance criteria**
Verify that each acceptance criterion in the issue description has been met. Look at comments, linked documents, and any other artifacts produced by the agent that worked the issue.

**3b. Quality of deliverables**
Assess whether the work product (document, plan, research output, architectural decision, etc.) is complete, accurate, and fit for purpose. Flag anything that is missing, incorrect, or contradicts existing project context.

**3c. Side-effects**
Check whether the work introduced any unintended consequences — e.g. a document that conflicts with \`CONTEXT.md\`, a plan that contradicts an ADR, or a decision that should have been recorded as an ADR but wasn't.

### 4. Verdict

#### Blocking issues found

If any acceptance criterion is unmet, the work is materially incomplete or incorrect, or a significant conflict exists:

1. Call \`unassign_issue(id)\`
2. Call \`add_comment\` on the issue with a detailed description of every problem found. The comment **must** start with:
   \`\`\`
   ISSUE DID NOT PASS REVIEW, PLEASE READ COMMENTS AND IMPLEMENT REQUESTED CHANGES
   \`\`\`
   Follow with a numbered list of specific, actionable problems.
3. Call \`move_issue(id, "TODO")\`

#### Minor non-blocking issues only

If the work passes but there are minor gaps, improvements, or follow-up tasks worth tracking:

1. Call \`create_issue\` with column \`BACKLOG\` for each cluster of related minor issues. Prefix the description with:
   \`\`\`
   follow-up

   Follow-up from [#<original-id>: <original-title>](/projects/<slug>/board/<original-id>)
   \`\`\`
   Then describe the specific follow-up work needed.
2. Call \`add_comment\` on the original issue:
   "Minor issues found. Follow-up issue(s) created: [#<new-id>](/projects/<slug>/board/<new-id>) [, ...]. The issue passes review."
3. Call \`unassign_issue(id)\`
4. Call \`move_issue(id, "DONE")\`

#### Clean pass

If everything is complete and correct:
1. Call \`add_comment\` on the issue: "Agent review passed. Acceptance criteria met."
2. Call \`unassign_issue(id)\`
3. Call \`move_issue(id, "DONE")\`
`,
  },
  {
    name: 'grill-with-docs',
    description: 'Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates the project context and ADR documents inline as decisions crystallise.',
    prompt: `# grill-with-docs

## Step 1 — Bootstrap domain context (do this before asking anything)

1. Call \`get_project_context\`. Note whether it is empty or populated.
2. Call \`list_docs\` and read any ADR documents found.
3. Briefly tell the user what you loaded: existing terms, past decisions, or "no context yet — we will build it together."

## Step 2 — Interview

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing.

If a question can be answered by the loaded context or documents, use that instead of asking.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in the project context, call it out immediately. "Your context defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Update project context inline

When a term is resolved, call \`update_project_context\` right there — don't batch these up. This applies even on a new project with no prior context: the first resolved term creates the context. Use the format in CONTEXT-FORMAT.md.

The project context should be totally devoid of implementation details. Do not treat it as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR (via \`create_doc\`) when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in ADR-FORMAT.md. Title ADR documents as "ADR: <short-title>".

## Tone

- Be precise and adversarial — identify weak spots, not just confirm the plan.
- Propose alternatives when you find a gap.
- End each round with a clear "what's decided" vs "what's still open" summary.
`,
    files: [
      {
        name: 'CONTEXT-FORMAT.md',
        content: `# CONTEXT.md Format

## Structure

\`\`\`md
# {Context Name}

{One or two sentence description of what this context is and why it exists.}

## Language

**Order**:
{A one or two sentence description of the term}
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request

**Customer**:
A person or organization that places orders.
_Avoid_: Client, buyer, account
\`\`\`

## Rules

- **Be opinionated.** When multiple words exist for the same concept, pick the best one and list the others under \`_Avoid_\`.
- **Keep definitions tight.** One or two sentences max. Define what it IS, not what it does.
- **Only include terms specific to this project's context.** General programming concepts don't belong. Before adding a term, ask: is this a concept unique to this context, or a general programming concept? Only the former belongs.
- **Group terms under subheadings** when natural clusters emerge. If all terms belong to a single cohesive area, a flat list is fine.
`,
      },
      {
        name: 'ADR-FORMAT.md',
        content: `# ADR Format

ADRs live in \`docs/adr/\` and use sequential numbering: \`0001-slug.md\`, \`0002-slug.md\`, etc.

Create the \`docs/adr/\` directory lazily — only when the first ADR is needed.

## Template

\`\`\`md
# {Short title of the decision}

{1-3 sentences: what's the context, what did we decide, and why.}
\`\`\`

That's it. An ADR can be a single paragraph. The value is in recording *that* a decision was made and *why* — not in filling out sections.

## Optional sections

Only include these when they add genuine value. Most ADRs won't need them.

- **Status** frontmatter (\`proposed | accepted | deprecated | superseded by ADR-NNNN\`) — useful when decisions are revisited
- **Considered Options** — only when the rejected alternatives are worth remembering
- **Consequences** — only when non-obvious downstream effects need to be called out

## Numbering

Scan \`docs/adr/\` for the highest existing number and increment by one.

## When to offer an ADR

All three of these must be true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will look at the code and wonder "why on earth did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If a decision is easy to reverse, skip it. If it's not surprising, nobody will wonder why. If there was no real alternative, there's nothing to record.
`,
      },
    ],
  },
  {
    name: 'tdd',
    description: 'Test-driven development with red-green-refactor loop for Forge issues.',
    prompt: `# tdd

You are implementing a Forge issue using test-driven development.

## Loop

1. **Red**: Write a failing test that captures one acceptance criterion from the issue.
2. **Green**: Write the minimum implementation to make that test pass.
3. **Refactor**: Clean up without breaking tests.
4. Repeat until all acceptance criteria have passing tests.

## Rules

- Never write implementation before a failing test exists for it.
- Tests must use the project's test runner (\`node:test\` + \`--experimental-strip-types\`).
- Integration tests hit a real database — no mocks for DB layer.
- After all tests pass, run \`tsc --noEmit\` and verify zero type errors.
- Move the issue to "Needs Human Review" when done and add a comment with test count.

## MCP calls to make

- \`get_issue(id)\` — load the issue description and acceptance criteria
- \`add_comment(target_type: "issue", ...)\` — report progress and final test count
- \`move_issue(id, "NEEDS_HUMAN_REVIEW")\` — signal completion
`,
  },
  {
    name: 'process-implementation-issue',
    description: 'End-to-end workflow for picking up and completing an implementation issue from the Forge board. Triggered when an issue description begins with "implementation-issue".',
    prompt: `# process-implementation-issue

An issue whose description starts with \`implementation-issue\` must be processed using this skill. Follow every step in order. Do not skip ahead.

## Step 1 — Claim the issue

1. Call \`assign_issue\` — this fails if another agent holds a non-stale lock (less than 4 hours old). If it fails, stop and output \`<promise>NO_ISSUES</promise>\`.
2. Call \`move_issue\` with \`column: "IN_PROGRESS"\`.
3. Call \`add_comment\` on the issue with body: "Picking up this issue."

## Step 2 — Read the PRD

Check the first line of the issue description for a PRD reference in the format \`implementation-issue, PRD: <prd-name>\`:

- If a PRD name is present, call \`list_docs\` with the issue ID, then scan for a document whose title matches the PRD name. If not found linked, search across all project documents.
- Call \`get_doc\` to read the full PRD content.
- If no PRD is referenced, proceed using the issue description alone.

## Step 3 — Write tests first (TDD — red phase)

Before writing any implementation:

1. Identify the acceptance criteria from the issue (and PRD if present).
2. Write failing tests — one test per acceptance criterion.
3. Run the test suite and confirm each new test fails for the right reason.

Do not write implementation code until the tests exist and are failing.

## Step 4 — Implement (TDD — green + refactor)

1. Write the minimum implementation to make the failing tests pass.
2. Run tests — iterate until all pass.
3. Refactor while keeping tests green.
4. Run the full test suite and type check to confirm zero regressions:
   - \`npm test\` (or the project's test command)
   - \`npx tsc --noEmit\` (or the project's type-check command)

Do not proceed until every test passes and there are no type errors.

## Step 5 — Commit

Commit all changes with a concise conventional-commit message describing what was implemented.

Note the full commit SHA — you will need it in the next step.

## Step 6 — Update the PRD

If a PRD was loaded in Step 2, call \`update_doc\` to append an implementation summary to it. Add a section at the end of the existing content:

\`\`\`
## Implementation

- What was implemented (bullet list, one item per feature or acceptance criterion)
- Commit: <SHA>
\`\`\`

Do not rewrite the PRD body — only append this section.

## Step 7 — Comment on the issue

Call \`add_comment\` on the issue (\`target_type: "issue"\`) with a brief implementation note. Include:

- What was implemented (bullet list, one item per feature or acceptance criterion)
- The git commit SHA

Example:
\`\`\`
Implemented:
- Added X to handle Y
- Updated Z to support W

Commit: abc1234def5678
\`\`\`

## Step 8 — Move to Needs Agent Review

1. Call \`unassign_issue\` to release the lock.
2. Call \`move_issue\` with \`column: "NEEDS_AGENT_REVIEW"\`.

A separate agent will review the work with fresh context.

---

## Reference: MCP tools

| Tool | Purpose |
|------|---------|
| \`assign_issue\` | Claim the issue for this agent (enforces lock) |
| \`unassign_issue\` | Release the lock when done |
| \`get_issue\` | Read the issue description and acceptance criteria |
| \`move_issue\` | Move the issue to a new column |
| \`add_comment\` | Post a comment to the issue |
| \`list_docs\` | List documents linked to the issue |
| \`get_doc\` | Read a document (e.g. the PRD) |

## Reference: Valid column names for move_issue

\`TODO\` → \`IN_PROGRESS\` → \`NEEDS_AGENT_REVIEW\`
`,
  },
  {
    name: 'process-general-issue',
    description: 'Workflow for picking up and completing a non-implementation issue from the Forge board (planning, research, writing, architecture, etc.).',
    prompt: `# process-general-issue

Use this skill for any issue that is NOT annotated with \`implementation-issue\`. Follow every step in order.

## Step 1 — Claim the issue

1. Call \`add_comment\` on the issue (\`target_type: "issue"\`) with body: "Picking up this issue."
2. Call \`move_issue\` with \`column: "IN_PROGRESS"\`.

## Step 2 — Read the PRD (if referenced)

Check the issue description for a PRD reference (a document ID, title, or phrase like "see PRD"):

- Call \`list_docs\` with the issue ID to find linked documents.
- If a PRD is found or referenced by name, call \`get_doc\` to read its full content.
- If no PRD is referenced, proceed using the issue description alone.

## Step 3 — Do the work

Read the issue description carefully and follow its instructions. The issue may ask you to:

- Write or update a document (use \`create_doc\` or \`update_doc\`)
- Research and summarise findings as a comment
- Make architectural or planning decisions and record them
- Any other non-code task described in the issue

Use your judgment to complete the work thoroughly. If the issue is ambiguous, do your best and note any assumptions in the closing comment.

## Step 4 — Update the PRD (if applicable)

If a PRD was loaded in Step 2 and the work you did is relevant to it, call \`update_doc\` to append a summary section at the end of the existing PRD content:

\`\`\`
## Update: <short title>

<What was done or decided, in bullet points>
\`\`\`

Do not rewrite the PRD body — only append.

## Step 5 — Comment on the issue

Call \`add_comment\` on the issue (\`target_type: "issue"\`) with a brief summary of what was done. Include:

- What was completed (bullet list)
- Any assumptions made or open questions remaining

## Step 6 — Move to Needs Human Review

Call \`move_issue\` with \`column: "NEEDS_HUMAN_REVIEW"\`.

A human will review the output and either approve or send it back with feedback.

---

## Reference: MCP tools

| Tool | Purpose |
|------|---------|
| \`get_issue\` | Read the issue description |
| \`move_issue\` | Move the issue to a new column |
| \`add_comment\` | Post a comment to the issue |
| \`list_docs\` | List documents linked to the issue |
| \`get_doc\` | Read a document (e.g. the PRD) |
| \`create_doc\` | Create a new document |
| \`update_doc\` | Append a new version to an existing document |

## Reference: Valid column names for move_issue

\`TODO\` → \`IN_PROGRESS\` → \`NEEDS_HUMAN_REVIEW\`
`,
  },
  {
    name: 'improve-codebase-architecture',
    description: 'Find refactoring opportunities in the codebase informed by the domain language in CONTEXT.md.',
    prompt: `# improve-codebase-architecture

You are identifying architectural improvements in the Forge codebase.

## Steps

1. Load the project context via \`get_project_context\` to understand the domain language.
2. Review the issue tracker (\`list_issues\`) for patterns in recent work.
3. Identify opportunities:
   - Modules with high coupling or low cohesion
   - Service interfaces that leak implementation details
   - Test coverage gaps at integration boundaries
   - Terminology drift between the domain model and code identifiers
4. For each opportunity, create a Forge issue (\`create_issue\`) with:
   - What the current state is
   - What the improved state looks like
   - Why it matters (testability, navigability, domain alignment)
5. Add a comment to summarise the review and list the created issues.

## Constraint

Do not propose changes that introduce new external dependencies or change public API contracts without human review.
`,
  },
];

interface SeedDb {
  skill: {
    findUnique(args: { where: { projectId_name?: { projectId: string; name: string }; name?: string } }): Promise<Skill | null>;
    create(args: { data: { name: string; description: string; prompt: string; projectId: string } }): Promise<Skill>;
  };
  skillFile: {
    create(args: { data: { skillId: string; name: string; content: string } }): Promise<unknown>;
  };
}

export async function seedDefaultSkills(db: SeedDb, projectId: string): Promise<void> {
  for (const skill of DEFAULT_SKILLS) {
    const existing = await db.skill.findUnique({ where: { projectId_name: { projectId, name: skill.name } } });
    if (!existing) {
      const created = await db.skill.create({ data: { name: skill.name, description: skill.description, prompt: skill.prompt, projectId } });
      for (const file of skill.files ?? []) {
        await db.skillFile.create({ data: { skillId: created.id, name: file.name, content: file.content } });
      }
    }
  }
}
