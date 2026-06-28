'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProject } from '../../project-context';
import { Markdown } from '../../../../../components/Markdown';
import { COLUMNS as STATE_COLUMNS, canTransition, type Column } from '@/lib/issues/state-machine';

const COLUMNS = [
  { id: 'BACKLOG', label: 'Backlog' },
  { id: 'TODO', label: 'Todo' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'NEEDS_HUMAN_REVIEW', label: 'Needs Human Review' },
  { id: 'NEEDS_AGENT_REVIEW', label: 'Needs Agent Review' },
  { id: 'DONE', label: 'Done' },
] as const;

type ColumnId = (typeof COLUMNS)[number]['id'];

function colLabel(id: string): string {
  return COLUMNS.find((c) => c.id === id)?.label ?? id;
}

function validTransitions(from: string): ColumnId[] {
  return STATE_COLUMNS.filter((col) => canTransition(from as Column, col)) as ColumnId[];
}

interface Issue {
  id: string;
  key: string;
  title: string;
  description: string;
  column: string;
  agentAssignee: string | null;
  agentAssignTs: string | null;
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

interface Dependency {
  id: string;
  key: string;
  title: string;
  column: string;
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
  const { id: projectId, slug } = useProject();
  const router = useRouter();

  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [unassigning, setUnassigning] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [showDepForm, setShowDepForm] = useState(false);
  const [depId, setDepId] = useState('');
  const [depSubmitting, setDepSubmitting] = useState(false);
  const [depError, setDepError] = useState<string | null>(null);

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
      const res = await fetch(`/api/issues/${id}?projectId=${projectId}`);
      if (res.status === 404) { router.push(`/projects/${slug}/board`); return; }
      if (!res.ok) throw new Error('Failed to fetch issue');
      setIssue(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [id, projectId, slug, router]);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/issues/${id}/comments?projectId=${projectId}`);
      if (!res.ok) return;
      setComments(await res.json());
    } catch {
      // non-critical
    }
  }, [id, projectId]);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/issues/${id}/documents?projectId=${projectId}`);
      if (!res.ok) return;
      setDocuments(await res.json());
    } catch {
      // non-critical
    }
  }, [id, projectId]);

  const fetchDeps = useCallback(async () => {
    try {
      const res = await fetch(`/api/issues/${id}/dependencies?projectId=${projectId}`);
      if (!res.ok) return;
      setDependencies(await res.json());
    } catch {
      // non-critical
    }
  }, [id, projectId]);

  const fetchDiffs = useCallback(async () => {
    try {
      const res = await fetch(`/api/issues/${id}/diffs?projectId=${projectId}`);
      if (!res.ok) return;
      setDiffs(await res.json());
    } catch {
      // non-critical
    }
  }, [id, projectId]);

  useEffect(() => {
    fetchIssue();
    fetchComments();
    fetchDocuments();
    fetchDeps();
    fetchDiffs();
  }, [fetchIssue, fetchComments, fetchDocuments, fetchDeps, fetchDiffs]);

  async function handleAddDep(e: React.FormEvent) {
    e.preventDefault();
    if (!depId.trim()) return;
    setDepSubmitting(true);
    setDepError(null);
    try {
      const res = await fetch(`/api/issues/${id}/dependencies?projectId=${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dependsOnId: depId.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to add dependency');
      }
      setDepId('');
      setShowDepForm(false);
      await fetchDeps();
    } catch (e) {
      setDepError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setDepSubmitting(false);
    }
  }

  async function handleRemoveDep(depIssueId: string) {
    try {
      await fetch(`/api/issues/${id}/dependencies/${depIssueId}?projectId=${projectId}`, { method: 'DELETE' });
      setDependencies((prev) => prev.filter((d) => d.id !== depIssueId));
    } catch {
      // non-critical
    }
  }

  async function handleMove(target: ColumnId) {
    if (!issue) return;
    setMoving(target);
    setMoveError(null);
    try {
      const res = await fetch(`/api/issues/${id}/move?projectId=${projectId}`, {
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

  async function handleUnassign() {
    if (!issue) return;
    setUnassigning(true);
    try {
      const res = await fetch(`/api/issues/${id}/unassign?projectId=${projectId}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Unassign failed');
      }
      setIssue(await res.json());
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : 'Unassign failed');
    } finally {
      setUnassigning(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/issues/${id}?projectId=${projectId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Delete failed');
      }
      router.push(`/projects/${slug}/board`);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  async function handleAddDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!docTitle.trim()) return;
    setDocSubmitting(true);
    setDocError(null);
    try {
      const res = await fetch(`/api/documents?projectId=${projectId}`, {
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
      const res = await fetch(`/api/issues/${id}/comments?projectId=${projectId}`, {
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

  const nextColumns = validTransitions(issue.column);

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
        <Link href={`/projects/${slug}/board`} className="text-sm text-indigo-600 hover:underline">
          ← Board
        </Link>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-lg">
            <h2 className="mb-2 text-base font-semibold text-gray-900">Delete issue?</h2>
            <p className="mb-5 text-sm text-gray-500">
              <span className="font-mono font-medium text-gray-700">{issue.key}</span> will be permanently deleted. This cannot be undone.
            </p>
            {deleteError && <p className="mb-3 text-xs text-red-600">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <span className="mb-1 block font-mono text-xs font-medium text-gray-400">{issue.key}</span>
            <h1 className="text-xl font-semibold text-gray-900">{issue.title}</h1>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${columnBadge[issue.column] ?? 'bg-gray-100 text-gray-600'}`}
            >
              {colLabel(issue.column)}
            </span>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
              title="Delete issue"
            >
              Delete
            </button>
          </div>
        </div>

        {issue.description ? (
          <Markdown className="text-sm text-gray-700">{issue.description}</Markdown>
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

        {issue.agentAssignee && (
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-amber-700">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400"></span>
              Assigned to <span className="font-medium">{issue.agentAssignee}</span>
              {issue.agentAssignTs && (
                <span className="text-gray-400">· since {new Date(issue.agentAssignTs).toLocaleString()}</span>
              )}
            </div>
            <button
              onClick={handleUnassign}
              disabled={unassigning}
              className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
            >
              {unassigning ? 'Unassigning…' : 'Unassign'}
            </button>
          </div>
        )}
        <div className="mt-2 text-xs text-gray-400">
          Created {new Date(issue.createdAt).toLocaleString()} ·{' '}
          Updated {new Date(issue.updatedAt).toLocaleString()}
        </div>
      </div>

      {/* Dependencies section */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Depends On {dependencies.length > 0 && <span className="text-gray-400">({dependencies.length})</span>}
          </h2>
          <button
            onClick={() => setShowDepForm((v) => !v)}
            className="text-xs text-indigo-600 hover:underline"
          >
            {showDepForm ? 'Cancel' : '+ Add Dependency'}
          </button>
        </div>

        {dependencies.length === 0 && !showDepForm && (
          <p className="text-sm text-gray-400 italic">No dependencies.</p>
        )}

        {dependencies.length > 0 && (
          <div className="space-y-2">
            {dependencies.map((dep) => (
              <div key={dep.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
                <Link
                  href={`/projects/${slug}/board/${dep.id}`}
                  className="text-sm text-gray-800 hover:text-indigo-600 hover:underline truncate"
                >
                  <span className="mr-1.5 font-mono text-xs text-gray-400">{dep.key}</span>{dep.title}
                </Link>
                <div className="ml-3 flex flex-shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${dep.column === 'DONE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {dep.column === 'DONE' ? 'Done' : dep.column.replace(/_/g, ' ')}
                  </span>
                  <button
                    onClick={() => handleRemoveDep(dep.id)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showDepForm && (
          <form onSubmit={handleAddDep} className="mt-3 flex gap-2">
            <input
              type="text"
              value={depId}
              onChange={(e) => setDepId(e.target.value)}
              placeholder="Issue key (e.g. FORG-1)…"
              required
              autoFocus
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <button
              type="submit"
              disabled={depSubmitting || !depId.trim()}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {depSubmitting ? 'Adding…' : 'Add'}
            </button>
          </form>
        )}
        {depError && <p className="mt-1 text-xs text-red-600">{depError}</p>}
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
                href={`/projects/${slug}/documents/${doc.id}`}
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
                href={`/projects/${slug}/diffs/${diff.id}`}
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
                const res = await fetch(`/api/diffs?projectId=${projectId}`, {
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
                <Markdown className="text-sm text-gray-800">{comment.body}</Markdown>
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
