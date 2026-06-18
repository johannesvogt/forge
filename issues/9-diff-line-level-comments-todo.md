## What to build

Line-level comments anchored to specific lines in a diff. A comment is anchored to a `(file_path, line_number, diff_id)` tuple. The diff viewer renders comment indicators inline; clicking reveals the thread. Anchors survive re-uploads because they are bound to a specific diff ID, not the latest.

Reuses the Comment data model from #4, adding the `diff_line` target type.

## Acceptance criteria

- [ ] Human can click any line in the diff viewer to open a comment input
- [ ] Submitted comment appears as an indicator on that line
- [ ] Clicking the indicator reveals the full comment thread for that line
- [ ] Comment anchor stores file path + line number + diff ID
- [ ] Comments on diff A are not shown when viewing diff B (same issue, different upload)
- [ ] Human can resolve a line comment
- [ ] Comment Engine integration tests: add line comment, list by diff+line anchor, resolve

## Blocked by

- #4 Issue comments
- #8 Diff upload + view
