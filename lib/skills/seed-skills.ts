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
- Each issue description includes: What to build, Acceptance criteria, Blocked by (if any).

## Steps

1. Read the PRD or spec from the current context (or fetch it via \`get_doc\`).
2. Identify the vertical slices — each one becomes one issue.
3. Call \`create_issue\` for each slice in dependency order.
4. Call \`add_comment\` on the parent issue (or PRD document) listing the created issue IDs.

## Output format

- One Forge issue per slice, created via \`create_issue\`
- Comment on the source document or issue with the full issue list
`,
  },
  {
    name: 'grill-with-docs',
    description: 'Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates the project context and ADR documents inline as decisions crystallise.',
    prompt: `# grill-with-docs

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing.

If a question can be answered by loading existing context or documents, do that instead of asking.

## Domain awareness

Start by calling \`get_project_context\`. If it returns empty, the context does not exist yet — you will create it when the first term is resolved. Also call \`list_docs\` to load any relevant existing documents.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in the project context, call it out immediately. "Your context defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Update project context inline

When a term is resolved, call \`update_project_context\` right there — don't batch these up. Use the format in CONTEXT-FORMAT.md.

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
