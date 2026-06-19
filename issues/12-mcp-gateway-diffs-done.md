## What to build

Extend the MCP server with diff tools. Agents can upload diffs, fetch diffs, list diffs on an issue, and read/add line-level comments on specific diff lines.

MCP tools delivered in this slice:
```
upload_diff(title, description, branch, diff_text, issue_id)
get_diff(id)
list_diffs(issue_id)
list_comments(target_type="diff_line", target_id, anchor?)
add_comment(target_type="diff_line", target_id, body, anchor?)
```

## Acceptance criteria

- [ ] `upload_diff` stores diff + metadata and returns its ID
- [ ] `get_diff` returns metadata + raw diff text
- [ ] `list_diffs` returns all diffs linked to an issue
- [ ] `add_comment` on a diff line records anchor (file_path, line_number, diff_id)
- [ ] `list_comments` on a diff line returns only comments for that anchor
- [ ] Uploading a second diff for an issue does not affect the first diff's comments
- [ ] MCP Gateway integration tests cover all diff tool round-trips

## Blocked by

- #9 Diff line-level comments
- #10 MCP Gateway — issues + comments
