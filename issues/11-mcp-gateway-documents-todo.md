## What to build

Extend the MCP server with document tools. Agents can create documents, fetch current or specific versions, update documents (appending a new version), list documents linked to an issue, and read inline comments on document sections.

MCP tools delivered in this slice:
```
list_docs(issue_id?)
get_doc(id, version?)
create_doc(title, content, issue_id)
update_doc(id, content)
list_comments(target_type="document_section", target_id, anchor?)
add_comment(target_type="document_section", target_id, body, anchor?)
```

## Acceptance criteria

- [ ] `create_doc` creates a document linked to an issue and returns its ID
- [ ] `update_doc` appends a new version; prior version unchanged
- [ ] `get_doc` without version returns latest content; with version returns that snapshot
- [ ] `list_docs` returns documents linked to the given issue
- [ ] `add_comment` on a document section records anchor (version_id, start_offset, end_offset)
- [ ] `list_comments` on a document section returns only comments for that anchor
- [ ] MCP Gateway integration tests cover all document tool round-trips

## Blocked by

- #7 Document inline comments
- #10 MCP Gateway — issues + comments
