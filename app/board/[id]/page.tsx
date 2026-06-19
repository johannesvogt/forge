'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const COLUMNS = [
  { id: 'BACKLOG', label: 'Backlog' },
  { id: 'TODO', label: 'Todo' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'NEEDS_HUMAN_REVIEW', label: 'Needs Human Review' },
  { id: 'NEEDS_AGENT_REVIEW', label: 'Needs Agent Review' },
  { id: 'DONE', label: 'Done' },
] as const;

type ColumnId = (typeof COLUMNS)[number]['id'];

const VALID_TRANSITIONS: Record<ColumnId, ColumnId[]> = {
  BACKLOG: ['TODO'],
  TODO: ['IN_PROGRESS'],
  IN_PROGRESS: ['NEEDS_HUMAN_REVIEW', 'NEEDS_AGENT_REVIEW', 'DONE'],
  NEEDS_HUMAN_REVIEW: ['DONE', 'IN_PROGRESS'],
  NEEDS_AGENT_REVIEW: ['DONE', 'IN_PROGRESS'],
  DONE: [],
};

function colLabel(id: string): string {
  return COLUMNS.find((c) => c.id === id)?.label ?? id;
}

interface Issue {
  id: string;
  title: string;
  description: string;
  column: string;
  createdAt: string;
  updatedAt: string;
}

interface Comment {
  id: string;
  body: string;
  authorLabel: string;
  authorUserId: string | null;
  status: string;
  createdAt: string;
}

interface LinkedDocument {
  id: string;
  title: string;
  versionNumber: number;
  createdAt: string;
  updatedAt: string;
}

interface LinkedDiff {
  id: string;
  title: string;
  description: string;
  branch: string;
  authorLabel: string;
  createdAt: string;
}

export default function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [documents, setDocuments] = useState<LinkedDocument[]>([]);
  const [showDocForm, setShowDocForm] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [docSubmitting, setDocSubmitting] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const [diffs, setDiffs] = useState<LinkedDiff[]>([]);
  const [showDiffForm, setShowDiffForm] = useState(false);
  const [diffTitle, setDiffTitle] = useState('');
  const [diffDescription, setDiffDescription] = useState('');
  const [diffBranch, setDiffBranch] = useState('');
  const [diffText, setDiffText] = useState('');
  const [diffSubmitting, setDiffSubmitting] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const fetchIssue = useCallback(async () => {
    try {
      const res = await fetch(`/api/issues/${id}`);
      if (res.status === 404) { router.push('/board'); return; }
      if (!res.ok) throw new Error('Failed to fetch issue');
      setIssue(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/issues/${id}/comments`);
      if (!res.ok) return;
      setComments(await res.json());
    } catch {
      // non-critical — comments fail silently
    }
  }, [id]);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/issues/${id}/documents`);
      if (!res.ok) return;
      setDocuments(await res.json());
    } catch {
      // non-critical — documents fail silently
    }
  }, [id]);

  const fetchDiffs = useCallback(async () => {
    try {
      const res = await fetch(`/api/issues/${id}/diffs`);
      if (!res.ok) return;
      setDiffs(await res.json());
    } catch {
      // non-critical — diffs fail silently
    }
  }, [id]);

  useEffect(() => {
    fetchIssue();
    fetchComments();
    fetchDocuments();
    fetchDiffs();
  }, [fetchIssue, fetchComments, fetchDocuments, fetchDiffs]);

  async function handleMove(target: ColumnId) {
    if (!issue) return;
    setMoving(target);
    setMoveError(null);
    try {
      const res = await fetch(`/api/issues/${id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: target }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Move failed');
      }
      setIssue(await res.json());
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setMoving(null);
    }
  }

  async function handleAddDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!docTitle.trim()) return;
    setDocSubmitting(true);
    setDocError(null);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: docTitle.trim(), content: docContent, issueId: id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to create document');
      }
      const newDoc: LinkedDocument = await res.json();
      setDocuments((prev) => [...prev, newDoc]);
      setDocTitle('');
      setDocContent('');
      setShowDocForm(false);
    } catch (e) {
      setDocError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setDocSubmitting(false);
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setSubmitting(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/issues/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to add comment');
      }
      const newComment: Comment = await res.json();
      setComments((prev) => [...prev, newComment]);
      setCommentBody('');
    } catch (e) {
      setCommentError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!issue) return null;

  const nextColumns = VALID_TRANSITIONS[issue.column as ColumnId] ?? [];

  const columnBadge: Record<string, string> = {
    NEEDS_HUMAN_REVIEW: 'bg-amber-100 text-amber-700',
    NEEDS_AGENT_REVIEW: 'bg-amber-100 text-amber-700',
    DONE: 'bg-green-100 text-green-700',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    TODO: 'bg-gray-100 text-gray-700',
    BACKLOG: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link href="/board" className="text-sm text-indigo-600 hover:underline">
          ← Board
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold text-gray-900">{issue.title}</h1>
          <span
            className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${columnBadge[issue.column] ?? 'bg-gray-100 text-gray-600'}`}
          >
            {colLabel(issue.column)}
          </span>
        </div>

        {issue.description ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{issue.description}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">No description.</p>
        )}

        <div className="mt-6 border-t border-gray-100 pt-4">
          <p className="mb-2 text-xs font-medium text-gray-500">Move to</p>
          {nextColumns.length === 0 ? (
            <p className="text-sm text-gray-400">No further transitions.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {nextColumns.map((col) => (
                <button
                  key={col}
                  onClick={() => handleMove(col)}
                  disabled={moving !== null}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 hover:border-indigo-400 disabled:opacity-50 transition-colors"
                >
                  {moving === col ? 'Moving…' : colLabel(col)}
                </button>
              ))}
            </div>
          )}
          {moveError && (
            <p className="mt-2 text-xs text-red-600">{moveError}</p>
          )}
        </div>

        <div className="mt-4 text-xs text-gray-400">
          Created {new Date(issue.createdAt).toLocaleString()} ·{' '}
          Updated {new Date(issue.updatedAt).toLocaleString()}
        </div>
      </div>

      {/* Documents section */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Documents {documents.length > 0 && <span className="text-gray-400">({documents.length})</span>}
          </h2>
          <button
            onClick={() => setShowDocForm((v) => !v)}
            className="text-xs text-indigo-600 hover:underline"
          >
            {showDocForm ? 'Cancel' : '+ New Document'}
          </button>
        </div>

        {documents.length === 0 && !showDocForm && (
          <p className="text-sm text-gray-400 italic">No documents yet.</p>
        )}

        {documents.length > 0 && (
          <div className="space-y-2">
            {documents.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-3 hover:border-indigo-300 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-800">{doc.title}</span>
                  <span className="flex-shrink-0 text-xs text-gray-400">v{doc.versionNumber}</span>
                </div>
                <p className="mt-0.5 text-xs text-gray-400">
                  {new Date(doc.updatedAt).toLocaleString()}
                </p>
              </Link>
            ))}
          </div>
        )}

        {showDocForm && (
          <form onSubmit={handleAddDocument} className="mt-3 space-y-2">
            <input
              type="text"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder="Document title…"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <textarea
              value={docContent}
              onChange={(e) => setDocContent(e.target.value)}
              placeholder="Content (markdown supported)…"
              rows={6}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            {docError && <p className="text-xs text-red-600">{docError}</p>}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={docSubmitting || !docTitle.trim()}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {docSubmitting ? 'Creating…' : 'Create Document'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Diffs section */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Diffs {diffs.length > 0 && <span className="text-gray-400">({diffs.length})</span>}
          </h2>
          <button
            onClick={() => setShowDiffForm((v) => !v)}
            className="text-xs text-indigo-600 hover:underline"
          >
            {showDiffForm ? 'Cancel' : '+ Upload Diff'}
          </button>
        </div>

        {diffs.length === 0 && !showDiffForm && (
          <p className="text-sm text-gray-400 italic">No diffs yet.</p>
        )}

        {diffs.length > 0 && (
          <div className="space-y-2">
            {diffs.map((diff) => (
              <Link
                key={diff.id}
                href={`/diffs/${diff.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-3 hover:border-indigo-300 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-800">{diff.title}</span>
                  <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-600">{diff.branch}</span>
                </div>
                {diff.description && (
                  <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{diff.description}</p>
                )}
                <p className="mt-0.5 text-xs text-gray-400">
                  {diff.authorLabel} · {new Date(diff.createdAt).toLocaleString()}
                </p>
              </Link>
            ))}
          </div>
        )}

        {showDiffForm && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!diffTitle.trim() || !diffBranch.trim()) return;
              setDiffSubmitting(true);
              setDiffError(null);
              try {
                const res = await fetch('/api/diffs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    title: diffTitle.trim(),
                    description: diffDescription,
                    branch: diffBranch.trim(),
                    diffText,
                    issueId: id,
                  }),
                });
                if (!res.ok) {
                  const data = await res.json();
                  throw new Error(data.error ?? 'Failed to upload diff');
                }
                const newDiff: LinkedDiff = await res.json();
                setDiffs((prev) => [...prev, newDiff]);
                setDiffTitle('');
                setDiffDescription('');
                setDiffBranch('');
                setDiffText('');
                setShowDiffForm(false);
              } catch (e) {
                setDiffError(e instanceof Error ? e.message : 'Unknown error');
              } finally {
                setDiffSubmitting(false);
              }
            }}
            className="mt-3 space-y-2"
          >
            <input
              type="text"
              value={diffTitle}
              onChange={(e) => setDiffTitle(e.target.value)}
              placeholder="Title…"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              type="text"
              value={diffBranch}
              onChange={(e) => setDiffBranch(e.target.value)}
              placeholder="Branch name…"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              type="text"
              value={diffDescription}
              onChange={(e) => setDiffDescription(e.target.value)}
              placeholder="Description (optional)…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <textarea
              value={diffText}
              onChange={(e) => setDiffText(e.target.value)}
              placeholder="Paste unified diff here…"
              rows={8}
              className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            {diffError && <p className="text-xs text-red-600">{diffError}</p>}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={diffSubmitting || !diffTitle.trim() || !diffBranch.trim()}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {diffSubmitting ? 'Uploading…' : 'Upload Diff'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Comment thread */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          Comments {comments.length > 0 && <span className="text-gray-400">({comments.length})</span>}
        </h2>

        {comments.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No comments yet.</p>
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => (
              <div key={comment.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-gray-700">{comment.authorLabel}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(comment.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{comment.body}</p>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddComment} className="mt-4">
          <textarea
            ref={textareaRef}
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Add a comment…"
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          {commentError && (
            <p className="mt-1 text-xs text-red-600">{commentError}</p>
          )}
          <div className="mt-2 flex justify-end">
            <button
              type="submit"
              disabled={submitting || !commentBody.trim()}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Posting…' : 'Comment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
