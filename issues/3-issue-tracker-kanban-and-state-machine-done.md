## What to build

The core issue tracker: a six-column kanban board where humans can create, view, and move issues, backed by a server-enforced state machine.

Columns in order: Backlog → Todo → In Progress → Needs Human Review / Needs Agent Review → Done. Invalid transitions are rejected server-side. Issues can move back to In Progress from any review column (rejection flow). The board is the primary view humans use to see project state.

State machine (from PRD prototype):
```
Backlog → Todo → In Progress → Needs Human Review → Done
                             → Needs Agent Review  → Done
                             → Done
         (any review column) → In Progress  (rejection)
```

## Acceptance criteria

- [ ] Kanban board renders all six columns with issues in their correct column
- [ ] Human can create an issue (title + description) from the board; defaults to Backlog
- [ ] Human can open an issue detail view showing title, description, and current column
- [ ] Human can move an issue to any valid next column via the UI
- [ ] Invalid transitions (e.g. Backlog → Done) are rejected with an error
- [ ] Needs Human Review and Needs Agent Review are visually distinct columns
- [ ] State machine unit tests cover every valid and invalid transition

## Blocked by

- #2 Human auth + API keys
