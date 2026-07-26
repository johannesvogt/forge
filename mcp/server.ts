import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createIssue, listIssues, updateIssue, addDependency, removeDependency, listDependencies, resolveIssue } from '../lib/issues/issue-service.ts';
import { agentIssueWorkflow } from '../lib/issues/agent-issue-workflow.ts';
import { projectArtifacts, type CommentAnchor, type CommentTarget } from '../lib/artifacts/project-artifact-service.ts';
import { getDocument, getDocumentAtVersion, updateDocument, listDocuments } from '../lib/documents/document-service.ts';
import { getDiff } from '../lib/diffs/diff-service.ts';
import { listSkills, getSkillWithFiles } from '../lib/skills/skill-service.ts';
import { getProjectContext, updateProjectContext } from '../lib/context/context-service.ts';
import { agentLabelFromHeaders } from '../lib/auth/agent-identity.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMcpServer(db: any, agentLabel: string, projectId: string): McpServer {
  const server = new McpServer({ name: 'forge-mcp', version: '1.0.0' });
  const agentLabelForRequest = (extra?: { requestInfo?: { headers?: Record<string, string | string[] | undefined> } }) =>
    agentLabelFromHeaders(extra?.requestInfo?.headers, agentLabel);
  const artifacts = projectArtifacts(db, projectId);
  const issueWorkflow = agentIssueWorkflow(db, projectId);
  const commentTarget = (type: string, id: string): CommentTarget => {
    if (type === 'issue') return { type: 'issue', issueId: id };
    if (type === 'document_section') return { type: 'documentVersion', versionId: id };
    if (type === 'diff_line') return { type: 'diff', diffId: id };
    throw new Error(`Unsupported comment target type: ${type}`);
  };

  server.tool(
    'list_issues',
    'List issues, optionally filtered by column. DONE issues older than 7 days are excluded.',
    { column: z.string().optional() },
    async ({ column }) => {
      const issues = await listIssues(db, projectId, column, { hideStaleDone: true });
      return { content: [{ type: 'text' as const, text: JSON.stringify(issues) }] };
    }
  );

  server.tool(
    'get_issue',
    'Get a single issue by key (e.g. FORG-1) or id, including its dependsOn list. DONE issues older than 7 days are not accessible.',
    { id: z.string().describe('Issue key (e.g. FORG-1) or internal id') },
    async ({ id }) => {
      const issue = await resolveIssue(db, projectId, id, { hideStaleDone: true });
      if (!issue) throw new Error(`Issue not found: ${id}`);
      const dependsOn = await listDependencies(db, projectId, issue.id);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ...issue, dependsOn }) }] };
    }
  );

  server.tool(
    'create_issue',
    'Create a new issue. Returns the issue including its assigned key (e.g. FORG-1).',
    {
      title: z.string(),
      description: z.string().optional(),
      column: z.string().optional(),
    },
    async ({ title, description, column }) => {
      const issue = await createIssue(db, projectId, { title, description, column });
      return { content: [{ type: 'text' as const, text: JSON.stringify(issue) }] };
    }
  );

  server.tool(
    'update_issue',
    'Update an issue title or description. Accepts key (e.g. FORG-1) or internal id.',
    {
      id: z.string().describe('Issue key (e.g. FORG-1) or internal id'),
      title: z.string().optional(),
      description: z.string().optional(),
    },
    async ({ id, title, description }) => {
      const issue = await resolveIssue(db, projectId, id);
      if (!issue) throw new Error(`Issue not found: ${id}`);
      const updated = await updateIssue(db, projectId, issue.id, { title, description });
      return { content: [{ type: 'text' as const, text: JSON.stringify(updated) }] };
    }
  );

  server.tool(
    'begin_issue_work',
    'Claim a TODO issue and begin work. Assignment, dependency gates, and the IN_PROGRESS transition are enforced atomically.',
    { id: z.string().describe('Issue key (e.g. FORG-1) or internal id') },
    async ({ id }, extra) => {
      const issue = await issueWorkflow.beginWork(id, agentLabelForRequest(extra));
      return { content: [{ type: 'text' as const, text: JSON.stringify(issue) }] };
    }
  );

  server.tool(
    'submit_issue_for_review',
    'Submit this agent\'s IN_PROGRESS issue for human or agent review and release the assignment atomically.',
    {
      id: z.string().describe('Issue key (e.g. FORG-1) or internal id'),
      review: z.enum(['human', 'agent']),
    },
    async ({ id, review }, extra) => {
      const issue = await issueWorkflow.submitForReview(id, agentLabelForRequest(extra), review);
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
      let parsedAnchor: CommentAnchor | undefined;
      if (anchor) {
        if (anchor.file_path !== undefined && anchor.line_number !== undefined) {
          parsedAnchor = { filePath: anchor.file_path, lineNumber: anchor.line_number };
        } else if (anchor.start_offset !== undefined && anchor.end_offset !== undefined) {
          parsedAnchor = { startOffset: anchor.start_offset, endOffset: anchor.end_offset };
        }
      }
      const comments = await artifacts.listComments(commentTarget(target_type, target_id), parsedAnchor);
      if (!comments) throw new Error(`Comment target not found: ${target_id}`);
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
    async ({ target_type, target_id, body, anchor }, extra) => {
      const input = {
        body,
        authorLabel: agentLabelForRequest(extra),
        authorUserId: null,
        anchorFilePath: anchor?.file_path ?? null,
        anchorStart: anchor?.line_number ?? anchor?.start_offset ?? null,
        anchorEnd: anchor?.end_offset ?? null,
      };
      const comment = await artifacts.addComment(commentTarget(target_type, target_id), input);
      if (!comment) throw new Error(`Comment target not found: ${target_id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(comment) }] };
    }
  );

  server.tool(
    'create_doc',
    'Create a new document. Optionally link to an issue via issue_id.',
    {
      title: z.string(),
      content: z.string(),
      issue_id: z.string().optional(),
    },
    async ({ title, content, issue_id }, extra) => {
      const doc = await artifacts.createDocument({
        title,
        content,
        issueId: issue_id ?? null,
        authorLabel: agentLabelForRequest(extra),
        authorUserId: null,
      });
      if (!doc) throw new Error(`Issue not found: ${issue_id}`);
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
        ? await getDocumentAtVersion(db, projectId, id, version)
        : await getDocument(db, projectId, id);
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
    async ({ id, content }, extra) => {
      const doc = await updateDocument(db, projectId, id, { content, authorLabel: agentLabelForRequest(extra), authorUserId: null });
      if (!doc) throw new Error(`Document not found: ${id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(doc) }] };
    }
  );

  server.tool(
    'list_docs',
    'List all project documents, optionally filtered to documents linked to an issue',
    {
      issue_id: z.string().optional(),
    },
    async ({ issue_id }) => {
      const docs = issue_id === undefined
        ? await listDocuments(db, projectId)
        : await artifacts.listDocumentsByIssue(issue_id);
      if (!docs) throw new Error(`Issue not found: ${issue_id}`);
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
    async ({ title, description, branch, diff_text, issue_id }, extra) => {
      const diff = await artifacts.uploadDiff({
        title,
        description,
        branch,
        diffText: diff_text,
        issueId: issue_id,
        authorLabel: agentLabelForRequest(extra),
        authorUserId: null,
      });
      if (!diff) throw new Error(`Issue not found: ${issue_id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(diff) }] };
    }
  );

  server.tool(
    'get_diff',
    'Get a diff artifact by ID',
    { id: z.string() },
    async ({ id }) => {
      const diff = await getDiff(db, projectId, id);
      if (!diff) throw new Error(`Diff not found: ${id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(diff) }] };
    }
  );

  server.tool(
    'list_diffs',
    'List diff artifacts linked to an issue',
    { issue_id: z.string() },
    async ({ issue_id }) => {
      const diffs = await artifacts.listDiffsByIssue(issue_id);
      if (!diffs) throw new Error(`Issue not found: ${issue_id}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(diffs) }] };
    }
  );

  server.tool(
    'list_skills',
    'List all available skills with their names and descriptions',
    {},
    async () => {
      const skills = await listSkills(db, projectId);
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
      const result = await getSkillWithFiles(db, projectId, name);
      if (!result) throw new Error(`Skill not found: ${name}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'add_dependency',
    'Add a dependency: dependent cannot move to IN_PROGRESS until depends_on is DONE. Accepts keys (e.g. FORG-1) or internal ids.',
    { dependent_id: z.string(), depends_on_id: z.string() },
    async ({ dependent_id, depends_on_id }) => {
      const dependent = await resolveIssue(db, projectId, dependent_id);
      if (!dependent) throw new Error(`Issue not found: ${dependent_id}`);
      const dependsOn = await resolveIssue(db, projectId, depends_on_id);
      if (!dependsOn) throw new Error(`Issue not found: ${depends_on_id}`);
      await addDependency(db, projectId, dependent.id, dependsOn.id);
      return { content: [{ type: 'text' as const, text: 'Dependency added' }] };
    }
  );

  server.tool(
    'remove_dependency',
    'Remove a dependency between two issues. Accepts keys (e.g. FORG-1) or internal ids.',
    { dependent_id: z.string(), depends_on_id: z.string() },
    async ({ dependent_id, depends_on_id }) => {
      const dependent = await resolveIssue(db, projectId, dependent_id);
      if (!dependent) throw new Error(`Issue not found: ${dependent_id}`);
      const dependsOn = await resolveIssue(db, projectId, depends_on_id);
      if (!dependsOn) throw new Error(`Issue not found: ${depends_on_id}`);
      await removeDependency(db, projectId, dependent.id, dependsOn.id);
      return { content: [{ type: 'text' as const, text: 'Dependency removed' }] };
    }
  );

  server.tool(
    'get_project_info',
    'Get project metadata: id, name, and slug. Use slug to construct links — documents: /projects/<slug>/documents/<docId>, issues: /projects/<slug>/board/<issueId>',
    {},
    async () => {
      const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, slug: true } });
      return { content: [{ type: 'text' as const, text: JSON.stringify(project) }] };
    }
  );

  server.tool(
    'get_project_context',
    'Get the current project context (CONTEXT.md). Load this at session start for project orientation.',
    {},
    async () => {
      const ctx = await getProjectContext(db, projectId);
      const content = ctx?.content ?? '';
      return { content: [{ type: 'text' as const, text: content }] };
    }
  );

  server.tool(
    'update_project_context',
    'Replace the project context with new content. Returns a warning if content exceeds 1000 tokens, but still saves.',
    { content: z.string() },
    async ({ content }, extra) => {
      const { context, warning } = await updateProjectContext(db, projectId, {
        content,
        authorLabel: agentLabelForRequest(extra),
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
