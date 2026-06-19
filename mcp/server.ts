import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createIssue, listIssues, getIssue, updateIssue, moveIssue } from '../lib/issues/issue-service.ts';
import { addComment, listComments } from '../lib/comments/comment-service.ts';
import { createDocument, getDocument, getDocumentAtVersion, updateDocument, listDocumentsByIssue } from '../lib/documents/document-service.ts';
import { uploadDiff, getDiff, listDiffsByIssue } from '../lib/diffs/diff-service.ts';
import { listSkills, getSkillWithFiles } from '../lib/skills/skill-service.ts';
import { getProjectContext, updateProjectContext } from '../lib/context/context-service.ts';
import type { Column } from '../lib/issues/state-machine.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMcpServer(db: any, agentLabel: string): McpServer {
  const server = new McpServer({ name: 'forge-mcp', version: '1.0.0' });

  server.tool(
    'list_issues',
    'List issues, optionally filtered by column',
    { column: z.string().optional() },
    async ({ column }) => {
      const issues = await listIssues(db, column);
      return { content: [{ type: 'text' as const, text: JSON.stringify(issues) }] };
    }
  );

  server.tool(
    'get_issue',
    'Get a single issue by ID',
    { id: z.string() },
    async ({ id }) => {
      const issue = await getIssue(db, id);
      if (!issue) throw new Error(`Issue not found: ${id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(issue) }] };
    }
  );

  server.tool(
    'create_issue',
    'Create a new issue',
    {
      title: z.string(),
      description: z.string().optional(),
      column: z.string().optional(),
    },
    async ({ title, description, column }) => {
      const issue = await createIssue(db, { title, description, column });
      return { content: [{ type: 'text' as const, text: JSON.stringify(issue) }] };
    }
  );

  server.tool(
    'update_issue',
    'Update an issue title or description',
    {
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
    },
    async ({ id, title, description }) => {
      const issue = await updateIssue(db, id, { title, description });
      return { content: [{ type: 'text' as const, text: JSON.stringify(issue) }] };
    }
  );

  server.tool(
    'move_issue',
    'Move an issue to a new column, enforcing the state machine',
    {
      id: z.string(),
      column: z.string(),
    },
    async ({ id, column }) => {
      const issue = await moveIssue(db, id, column as Column);
      return { content: [{ type: 'text' as const, text: JSON.stringify(issue) }] };
    }
  );

  server.tool(
    'list_comments',
    'List comments on a target (issue, document_section, or diff_line)',
    {
      target_type: z.string(),
      target_id: z.string(),
      anchor: z
        .object({
          start_offset: z.number().optional(),
          end_offset: z.number().optional(),
          file_path: z.string().optional(),
          line_number: z.number().optional(),
        })
        .optional(),
    },
    async ({ target_type, target_id, anchor }) => {
      let parsedAnchor: Parameters<typeof listComments>[3];
      if (anchor) {
        if (anchor.file_path !== undefined && anchor.line_number !== undefined) {
          parsedAnchor = { filePath: anchor.file_path, lineNumber: anchor.line_number };
        } else if (anchor.start_offset !== undefined && anchor.end_offset !== undefined) {
          parsedAnchor = { startOffset: anchor.start_offset, endOffset: anchor.end_offset };
        }
      }
      const comments = await listComments(db, target_type, target_id, parsedAnchor);
      return { content: [{ type: 'text' as const, text: JSON.stringify(comments) }] };
    }
  );

  server.tool(
    'add_comment',
    'Add a comment to a target (issue, document_section, or diff_line)',
    {
      target_type: z.string(),
      target_id: z.string(),
      body: z.string(),
      anchor: z
        .object({
          start_offset: z.number().optional(),
          end_offset: z.number().optional(),
          file_path: z.string().optional(),
          line_number: z.number().optional(),
        })
        .optional(),
    },
    async ({ target_type, target_id, body, anchor }) => {
      const input: Parameters<typeof addComment>[1] = {
        targetType: target_type,
        targetId: target_id,
        body,
        authorLabel: agentLabel,
        authorUserId: null,
      };
      if (anchor) {
        if (anchor.file_path !== undefined) {
          input.anchorFilePath = anchor.file_path;
          input.anchorStart = anchor.line_number ?? null;
        } else {
          input.anchorStart = anchor.start_offset ?? null;
          input.anchorEnd = anchor.end_offset ?? null;
        }
      }
      const comment = await addComment(db, input);
      return { content: [{ type: 'text' as const, text: JSON.stringify(comment) }] };
    }
  );

  server.tool(
    'create_doc',
    'Create a new document linked to an issue',
    {
      title: z.string(),
      content: z.string(),
      issue_id: z.string(),
    },
    async ({ title, content, issue_id }) => {
      const doc = await createDocument(db, {
        title,
        content,
        issueId: issue_id,
        authorLabel: agentLabel,
        authorUserId: null,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(doc) }] };
    }
  );

  server.tool(
    'get_doc',
    'Get a document by ID, optionally at a specific version number',
    {
      id: z.string(),
      version: z.number().optional(),
    },
    async ({ id, version }) => {
      const doc = version !== undefined
        ? await getDocumentAtVersion(db, id, version)
        : await getDocument(db, id);
      if (!doc) throw new Error(`Document not found: ${id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(doc) }] };
    }
  );

  server.tool(
    'update_doc',
    'Update a document, appending a new version with the given content',
    {
      id: z.string(),
      content: z.string(),
    },
    async ({ id, content }) => {
      const doc = await updateDocument(db, id, { content, authorLabel: agentLabel, authorUserId: null });
      if (!doc) throw new Error(`Document not found: ${id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(doc) }] };
    }
  );

  server.tool(
    'list_docs',
    'List documents linked to an issue',
    {
      issue_id: z.string(),
    },
    async ({ issue_id }) => {
      const docs = await listDocumentsByIssue(db, issue_id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(docs) }] };
    }
  );

  server.tool(
    'upload_diff',
    'Upload a diff artifact linked to an issue',
    {
      title: z.string(),
      description: z.string().optional(),
      branch: z.string(),
      diff_text: z.string(),
      issue_id: z.string(),
    },
    async ({ title, description, branch, diff_text, issue_id }) => {
      const diff = await uploadDiff(db, {
        title,
        description,
        branch,
        diffText: diff_text,
        issueId: issue_id,
        authorLabel: agentLabel,
        authorUserId: null,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(diff) }] };
    }
  );

  server.tool(
    'get_diff',
    'Get a diff artifact by ID',
    { id: z.string() },
    async ({ id }) => {
      const diff = await getDiff(db, id);
      if (!diff) throw new Error(`Diff not found: ${id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(diff) }] };
    }
  );

  server.tool(
    'list_diffs',
    'List diff artifacts linked to an issue',
    { issue_id: z.string() },
    async ({ issue_id }) => {
      const diffs = await listDiffsByIssue(db, issue_id);
      return { content: [{ type: 'text' as const, text: JSON.stringify(diffs) }] };
    }
  );

  server.tool(
    'list_skills',
    'List all available skills with their names and descriptions',
    {},
    async () => {
      const skills = await listSkills(db);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(skills.map((s) => ({ name: s.name, description: s.description }))),
          },
        ],
      };
    }
  );

  server.tool(
    'get_skill',
    'Get a skill by name, returning its primary prompt and all supporting files',
    { name: z.string() },
    async ({ name }) => {
      const result = await getSkillWithFiles(db, name);
      if (!result) throw new Error(`Skill not found: ${name}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'get_project_context',
    'Get the current project context (CONTEXT.md). Load this at session start for project orientation.',
    {},
    async () => {
      const ctx = await getProjectContext(db);
      const content = ctx?.content ?? '';
      return { content: [{ type: 'text' as const, text: content }] };
    }
  );

  server.tool(
    'update_project_context',
    'Replace the project context with new content. Returns a warning if content exceeds 1000 tokens, but still saves.',
    { content: z.string() },
    async ({ content }) => {
      const { context, warning } = await updateProjectContext(db, {
        content,
        authorLabel: agentLabel,
        authorUserId: null,
      });
      const result: { id: string; authorLabel: string; updatedAt: Date; warning?: string } = {
        id: context.id,
        authorLabel: context.authorLabel,
        updatedAt: context.updatedAt,
      };
      if (warning) result.warning = warning;
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  return server;
}
