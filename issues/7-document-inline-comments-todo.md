## What to build

Inline comments anchored to specific sections of a document. A comment is anchored to a character offset range within a specific document version. The document viewer highlights commented sections and shows comment threads on hover or in a side panel.

Reuses the Comment data model from #4, adding the `document_section` target type with a `(version_id, start_offset, end_offset)` anchor.

## Acceptance criteria

- [ ] Human can select a text range in the document viewer and add an inline comment
- [ ] Commented sections are visually highlighted in the document viewer
- [ ] Clicking a highlighted section reveals the comment thread for that anchor
- [ ] Comments are anchored to a specific document version (not the live document)
- [ ] Human can resolve a comment; resolved comments are visually distinguished
- [ ] `list_comments(target_type="document_section", target_id, anchor)` returns comments for that anchor
- [ ] Comment Engine integration tests: add inline comment, list by anchor, resolve comment

## Blocked by

- #4 Issue comments
- #6 Document store — versioning
