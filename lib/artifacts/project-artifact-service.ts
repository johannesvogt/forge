import { addComment, listComments, resolveComment, type Anchor, type Comment, type DiffLineAnchor } from '../comments/comment-service.ts';
import { createDocument, linkDocumentToIssue, listDocumentsByIssue, type Document } from '../documents/document-service.ts';
import { listDiffsByIssue, uploadDiff, type Diff } from '../diffs/diff-service.ts';
import { addSkillFile, deleteSkillFile, type SkillFile } from '../skills/skill-service.ts';

/** A comment target whose parentage can be proved inside a project. */
export type CommentTarget =
  | { type: 'issue'; issueId: string }
  | { type: 'documentVersion'; versionId: string; documentId?: string }
  | { type: 'diff'; diffId: string };

export type CommentAnchor = Anchor | DiffLineAnchor;

type Author = { authorUserId?: string | null; authorLabel: string };

type OwnedRow = { id?: string; projectId?: string; skillId?: string; documentId?: string };
type Lookup = { findUnique(args: { where: { id: string } }): Promise<OwnedRow | null> };
type Db = {
  issue: Lookup;
  document: Lookup;
  documentVersion: Lookup;
  diff: Lookup;
  skill: Lookup;
  skillFile: Lookup;
  comment: { findUnique(args: { where: { id: string } }): Promise<Comment | null> };
};

async function owned(model: Lookup, projectId: string, id: string) {
  const row = await model.findUnique({ where: { id } });
  return row?.projectId === projectId ? row : null;
}

async function targetStorage(db: Db, projectId: string, target: CommentTarget) {
  if (target.type === 'issue') {
    const issue = await owned(db.issue, projectId, target.issueId);
    return issue ? { targetType: 'issue', targetId: target.issueId } : null;
  }
  if (target.type === 'diff') {
    const diff = await owned(db.diff, projectId, target.diffId);
    return diff ? { targetType: 'diff_line', targetId: target.diffId } : null;
  }
  const version = await db.documentVersion.findUnique({ where: { id: target.versionId } });
  if (!version?.documentId || (target.documentId && version.documentId !== target.documentId)) return null;
  const document = await owned(db.document, projectId, version.documentId);
  return document ? { targetType: 'document_section', targetId: target.versionId } : null;
}

async function storedCommentTarget(db: Db, projectId: string, comment: Comment): Promise<CommentTarget | null> {
  if (comment.targetType === 'issue') return { type: 'issue', issueId: comment.targetId };
  if (comment.targetType === 'diff_line') return { type: 'diff', diffId: comment.targetId };
  if (comment.targetType !== 'document_section') return null;

  const version = await db.documentVersion.findUnique({ where: { id: comment.targetId } });
  if (!version) return null;
  return { type: 'documentVersion', documentId: version.documentId, versionId: comment.targetId };
}

/**
 * The single ownership seam for writes and reads involving multiple artifacts.
 * A null result always means that a referenced artifact is missing from the
 * active project (including a cross-project reference).
 */
export function projectArtifacts(db: Db, projectId: string) {
  return {
    async createDocument(input: {
      title: string;
      content: string;
      issueId?: string | null;
    } & Author): Promise<Document | null> {
      if (input.issueId) {
        const issue = await owned(db.issue, projectId, input.issueId);
        if (!issue) return null;
      }
      return createDocument(db as never, projectId, input);
    },

    async linkDocumentToIssue(documentId: string, issueId: string): Promise<boolean> {
      const [document, issue] = await Promise.all([
        owned(db.document, projectId, documentId),
        owned(db.issue, projectId, issueId),
      ]);
      if (!document || !issue) return false;
      await linkDocumentToIssue(db as never, projectId, documentId, issueId);
      return true;
    },

    async listDocumentsByIssue(issueId: string): Promise<Document[] | null> {
      const issue = await owned(db.issue, projectId, issueId);
      return issue ? listDocumentsByIssue(db as never, projectId, issueId) : null;
    },

    async uploadDiff(input: {
      title: string;
      description?: string;
      branch: string;
      diffText: string;
      issueId: string;
    } & Author): Promise<Diff | null> {
      const issue = await owned(db.issue, projectId, input.issueId);
      if (!issue) return null;
      return uploadDiff(db as never, projectId, input);
    },

    async listDiffsByIssue(issueId: string): Promise<Diff[] | null> {
      const issue = await owned(db.issue, projectId, issueId);
      return issue ? listDiffsByIssue(db as never, projectId, issueId) : null;
    },

    async addComment(target: CommentTarget, input: { body: string } & Author & {
      anchorStart?: number | null;
      anchorEnd?: number | null;
      anchorFilePath?: string | null;
    }): Promise<Comment | null> {
      const stored = await targetStorage(db, projectId, target);
      if (!stored) return null;
      return addComment(db as never, { ...stored, ...input });
    },

    async listComments(target: CommentTarget, anchor?: CommentAnchor): Promise<Comment[] | null> {
      const stored = await targetStorage(db, projectId, target);
      if (!stored) return null;
      return listComments(db as never, stored.targetType, stored.targetId, anchor);
    },

    async resolveComment(id: string): Promise<Comment | null> {
      const comment = await db.comment.findUnique({ where: { id } });
      if (!comment) return null;
      const target = await storedCommentTarget(db, projectId, comment);
      if (!target || !(await targetStorage(db, projectId, target))) return null;
      return resolveComment(db as never, id);
    },

    async addSkillFile(skillId: string, input: { name: string; content: string }): Promise<SkillFile | null> {
      const skill = await owned(db.skill, projectId, skillId);
      if (!skill) return null;
      return addSkillFile(db as never, projectId, skillId, input);
    },

    async deleteSkillFile(skillId: string, fileId: string): Promise<boolean> {
      const skill = await owned(db.skill, projectId, skillId);
      if (!skill) return false;
      const file = await db.skillFile.findUnique({ where: { id: fileId } });
      if (!file || file.skillId !== skillId) return false;
      await deleteSkillFile(db as never, projectId, fileId);
      return true;
    },
  };
}
