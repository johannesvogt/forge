import type { Skill } from './skill-service.ts';

const DEFAULT_SKILLS: Array<{ name: string; description: string; prompt: string }> = [
  {
    name: 'to-prd',
    description: 'Turn the current conversation context into a PRD and publish it to the Forge issue tracker.',
    prompt: `# to-prd

You are producing a Product Requirements Document (PRD) from the current conversation context.

## Steps

1. Synthesise the problem statement, solution hypothesis, and user stories from the conversation.
2. Structure the PRD with sections: Problem Statement, Solution, User Stories, Implementation Decisions, Out of Scope.
3. Call \`create_doc\` via MCP to create a new document titled "PRD: <topic>" linked to the relevant issue.
4. Call \`add_comment\` on the issue to announce that the PRD has been published and include the document ID.

## Output format

- Primary deliverable: a Forge document created via \`create_doc\`
- Comment on the parent issue with a summary and the document link
- Do not output the full PRD text to the conversation — put it in the document
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
    description: 'Stress-test a plan against the project domain model and update CONTEXT.md as decisions crystallise.',
    prompt: `# grill-with-docs

You are challenging a plan or design against the project's domain model and documented decisions.

## Steps

1. Load the project context via \`get_project_context\`.
2. Load relevant skills and documents via \`list_docs\` and \`get_doc\`.
3. Ask probing questions about the plan: terminology mismatches, missing constraints, unaddressed edge cases.
4. For each decision that crystallises, add a comment to the relevant issue documenting the decision and rationale.
5. If CONTEXT.md needs updating, call \`update_project_context\` with the revised content.

## Tone

- Be precise and adversarial — identify weak spots, not just confirm the plan.
- Propose alternatives when you find a gap.
- End each round with a clear "what's decided" vs "what's still open" summary.
`,
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
    findUnique(args: { where: { name: string } }): Promise<Skill | null>;
    create(args: { data: { name: string; description: string; prompt: string } }): Promise<Skill>;
  };
}

export async function seedDefaultSkills(db: SeedDb): Promise<void> {
  for (const skill of DEFAULT_SKILLS) {
    const existing = await db.skill.findUnique({ where: { name: skill.name } });
    if (!existing) {
      await db.skill.create({ data: skill });
    }
  }
}
