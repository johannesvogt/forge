'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import 'diff2html/bundles/css/diff2html.min.css';
import { useProject } from '../../project-context';

interface DiffDetail {
  id: string;
  title: string;
  description: string;
  branch: string;
  diffText: string;
  issueId: string;
  authorLabel: string;
  authorUserId: string | null;
  createdAt: string;
}

interface LineComment {
  id: string;
  body: string;
  authorLabel: string;
  status: string;
  createdAt: string;
  anchorFilePath: string | null;
  anchorStart: number | null;
}

interface CommentsByLine {
  [key: string]: LineComment[];
}

export default function DiffViewerPage() {
  const { id } = useParams<{ id: string }>();
  const { id: projectId, slug } = useProject();
  const [diff, setDiff] = useState<DiffDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const diffContainerRef = useRef<HTMLDivElement>(null);

  const [commentsByLine, setCommentsByLine] = useState<CommentsByLine>({});
  const [activeThread, setActiveThread] = useState<{ filePath: string; lineNumber: number } | null>(null);
  const [commentForm, setCommentForm] = useState<{ filePath: string; lineNumber: number } | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDiff = useCallback(async () => {
    try {
      const res = await fetch(`/api/diffs/${id}?projectId=${projectId}`);
      if (res.status === 404) {
        setError('Diff not found.');
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch diff');
      setDiff(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [id, projectId]);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/diffs/${id}/comments`);
      if (!res.ok) return;
      const comments: LineComment[] = await res.json();
      const grouped: CommentsByLine = {};
      for (const c of comments) {
        if (c.anchorFilePath && c.anchorStart !== null) {
          const key = `${c.anchorFilePath}:${c.anchorStart}`;
          (grouped[key] ??= []).push(c);
        }
      }
      setCommentsByLine(grouped);
    } catch {
      // non-fatal
    }
  }, [id]);

  useEffect(() => {
    fetchDiff();
    fetchComments();
  }, [fetchDiff, fetchComments]);

  useEffect(() => {
    if (!diff?.diffText || !diffContainerRef.current) return;

    import('diff2html').then(({ html }) => {
      const rendered = html(diff.diffText, {
        drawFileList: true,
        matching: 'lines',
        outputFormat: 'line-by-line',
      });
      if (diffContainerRef.current) {
        diffContainerRef.current.innerHTML = rendered;
      }
    });
  }, [diff]);

  useEffect(() => {
    if (!diffContainerRef.current || !diff) return;

    const container = diffContainerRef.current;

    const addHandlers = () => {
      const fileHeaders = container.querySelectorAll('.d2h-file-header .d2h-file-name');
      fileHeaders.forEach((header) => {
        const filePath = header.textContent?.trim() ?? '';
        const fileWrapper = header.closest('.d2h-file-wrapper');
        if (!fileWrapper) return;

        const lineRows = fileWrapper.querySelectorAll('tr');
        lineRows.forEach((row) => {
          const lineNoCell = row.querySelector('.d2h-code-linenumber, .d2h-del-linenumber, .d2h-ins-linenumber');
          if (!lineNoCell) return;

          const lineNumText = lineNoCell.textContent?.trim();
          const lineNumber = lineNumText ? parseInt(lineNumText, 10) : NaN;
          if (isNaN(lineNumber) || lineNumber <= 0) return;

          const key = `${filePath}:${lineNumber}`;
          const existingComments = commentsByLine[key] ?? [];

          const prev = row.querySelector('.forge-comment-indicator');
          if (prev) prev.remove();

          if (existingComments.length > 0) {
            const badge = document.createElement('span');
            badge.className = 'forge-comment-indicator';
            badge.style.cssText = 'cursor:pointer;background:#fbbf24;color:#1f2937;border-radius:9999px;padding:0 6px;font-size:11px;margin-left:4px;font-weight:600;';
            badge.textContent = String(existingComments.length);
            badge.title = `${existingComments.length} comment(s) — click to view`;
            badge.addEventListener('click', (e) => {
              e.stopPropagation();
              setActiveThread({ filePath, lineNumber });
              setCommentForm(null);
            });
            lineNoCell.appendChild(badge);
          }

          (row as HTMLElement).style.cursor = 'pointer';
          row.addEventListener('click', () => {
            setCommentForm({ filePath, lineNumber });
            setActiveThread(null);
            setCommentBody('');
          });
        });
      });
    };

    const timer = setTimeout(addHandlers, 100);
    return () => clearTimeout(timer);
  }, [diff, commentsByLine]);

  const submitComment = async () => {
    if (!commentForm || !commentBody.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/diffs/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: commentBody.trim(),
          filePath: commentForm.filePath,
          lineNumber: commentForm.lineNumber,
        }),
      });
      if (res.ok) {
        const newComment: LineComment = await res.json();
        const key = `${commentForm.filePath}:${commentForm.lineNumber}`;
        setCommentsByLine((prev) => ({
          ...prev,
          [key]: [...(prev[key] ?? []), newComment],
        }));
        setCommentForm(null);
        setCommentBody('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resolveComment = async (commentId: string, filePath: string, lineNumber: number) => {
    const res = await fetch(`/api/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    });
    if (res.ok) {
      const key = `${filePath}:${lineNumber}`;
      setCommentsByLine((prev) => ({
        ...prev,
        [key]: (prev[key] ?? []).map((c) =>
          c.id === commentId ? { ...c, status: 'resolved' } : c
        ),
      }));
    }
  };

  const threadComments =
    activeThread
      ? commentsByLine[`${activeThread.filePath}:${activeThread.lineNumber}`] ?? []
      : [];

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!diff) return null;

  return (
    <div className="max-w-5xl">
      <div className="mb-4">
        <Link href={`/projects/${slug}/board/${diff.issueId}`} className="text-sm text-indigo-600 hover:underline">
          ← Issue
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-1 flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold text-gray-900">{diff.title}</h1>
          <span className="flex-shrink-0 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">
            {diff.branch}
          </span>
        </div>
        {diff.description && (
          <p className="mt-1 text-sm text-gray-600">{diff.description}</p>
        )}
        <p className="mt-2 text-xs text-gray-400">
          {diff.authorLabel} · {new Date(diff.createdAt).toLocaleString()}
        </p>
      </div>

      {commentForm && (
        <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <p className="mb-2 text-xs font-medium text-indigo-700">
            Comment on <span className="font-mono">{commentForm.filePath}</span> line {commentForm.lineNumber}
          </p>
          <textarea
            className="w-full rounded border border-gray-300 p-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            rows={3}
            placeholder="Leave a comment…"
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={submitComment}
              disabled={submitting || !commentBody.trim()}
              className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
            <button
              onClick={() => setCommentForm(null)}
              className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {activeThread && (
        <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-yellow-800">
              Thread: <span className="font-mono">{activeThread.filePath}</span> line {activeThread.lineNumber}
            </p>
            <button
              onClick={() => setActiveThread(null)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>
          <div className="space-y-3">
            {threadComments.map((c) => (
              <div
                key={c.id}
                className={`rounded border p-3 text-sm ${
                  c.status === 'resolved'
                    ? 'border-gray-200 bg-gray-50 text-gray-400'
                    : 'border-yellow-200 bg-white'
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-700">{c.authorLabel}</span>
                  <div className="flex items-center gap-2">
                    {c.status === 'resolved' && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-500">resolved</span>
                    )}
                    {c.status !== 'resolved' && (
                      <button
                        onClick={() => resolveComment(c.id, activeThread.filePath, activeThread.lineNumber)}
                        className="text-xs text-gray-400 hover:text-gray-600 underline"
                      >
                        Resolve
                      </button>
                    )}
                    <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <p className="text-gray-800">{c.body}</p>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              setCommentForm(activeThread);
              setActiveThread(null);
              setCommentBody('');
            }}
            className="mt-3 text-xs text-indigo-600 hover:underline"
          >
            + Add reply
          </button>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
          <span className="text-xs font-medium text-gray-600">Diff — click any line to comment</span>
        </div>
        {diff.diffText.trim() ? (
          <div className="overflow-x-auto p-2" ref={diffContainerRef} />
        ) : (
          <p className="px-4 py-6 text-sm text-gray-400 italic">No diff content.</p>
        )}
      </div>
    </div>
  );
}
