'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useProject } from '../../project-context';
import { Markdown } from '@/components/Markdown';

interface Document {
  id: string;
  title: string;
  content: string;
  versionNumber: number;
  createdAt: string;
  updatedAt: string;
}

interface VersionSummary {
  id: string;
  versionNumber: number;
  authorLabel: string;
  authorUserId: string | null;
  createdAt: string;
}

interface InlineComment {
  id: string;
  targetType: string;
  targetId: string;
  body: string;
  authorUserId: string | null;
  authorLabel: string;
  status: string;
  createdAt: string;
  anchorStart: number | null;
  anchorEnd: number | null;
}

type Tab = 'view' | 'diff';

interface SelectionState {
  start: number;
  end: number;
  x: number;
  y: number;
}

export default function DocumentViewerPage() {
  const { id } = useParams<{ id: string }>();
  const { id: projectId, slug } = useProject();
  const [doc, setDoc] = useState<Document | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('view');
  const [diffFrom, setDiffFrom] = useState<number>(1);
  const [diffTo, setDiffTo] = useState<number>(2);
  const [diffText, setDiffText] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [comments, setComments] = useState<InlineComment[]>([]);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [newCommentBody, setNewCommentBody] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [activeAnchor, setActiveAnchor] = useState<{ start: number; end: number } | null>(null);
  const [viewMode, setViewMode] = useState<'markdown' | 'raw'>('markdown');
  const contentRef = useRef<HTMLPreElement>(null);
  const markdownContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/documents/${id}/versions?projectId=${projectId}`)
      .then(async (res) => {
        if (!res.ok) return;
        const vs: VersionSummary[] = await res.json();
        setVersions(vs);
        if (vs.length >= 2) {
          setDiffFrom(1);
          setDiffTo(vs[vs.length - 1].versionNumber);
        }
      })
      .catch(() => {});
  }, [id, projectId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url =
      selectedVersion !== null
        ? `/api/documents/${id}?projectId=${projectId}&version=${selectedVersion}`
        : `/api/documents/${id}?projectId=${projectId}`;
    fetch(url)
      .then(async (res) => {
        if (res.status === 404) { setError('Document not found.'); return; }
        if (!res.ok) throw new Error('Failed to load document');
        setDoc(await res.json());
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }, [id, projectId, selectedVersion]);

  useEffect(() => {
    if (!doc) return;
    const currentVersion = versions.find((v) => v.versionNumber === doc.versionNumber);
    if (!currentVersion) return;
    fetch(`/api/documents/${id}/comments?versionId=${currentVersion.id}`)
      .then(async (res) => {
        if (!res.ok) return;
        setComments(await res.json());
      })
      .catch(() => {});
  }, [id, doc, versions]);

  function loadDiff() {
    setDiffLoading(true);
    setDiffText(null);
    fetch(`/api/documents/${id}/diff?projectId=${projectId}&from=${diffFrom}&to=${diffTo}`)
      .then(async (res) => {
        if (!res.ok) { setDiffText('Could not compute diff.'); return; }
        const data = await res.json();
        setDiffText(data.diff);
      })
      .catch(() => setDiffText('Failed to load diff.'))
      .finally(() => setDiffLoading(false));
  }

  const handleTextSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !contentRef.current) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const preEl = contentRef.current;
    const preRange = window.document.createRange();
    preRange.selectNodeContents(preEl);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const end = start + range.toString().length;
    if (start === end) { setSelection(null); return; }
    const rect = range.getBoundingClientRect();
    const preRect = preEl.getBoundingClientRect();
    setSelection({
      start,
      end,
      x: rect.left - preRect.left,
      y: rect.bottom - preRect.top + 4,
    });
  }, []);

  const handleMarkdownSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !markdownContentRef.current) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const selectedText = range.toString();
    if (!selectedText) { setSelection(null); return; }

    const rawIdx = doc?.content.indexOf(selectedText) ?? -1;
    const rect = range.getBoundingClientRect();
    const containerRect = markdownContentRef.current.getBoundingClientRect();
    setSelection({
      start: rawIdx,
      end: rawIdx >= 0 ? rawIdx + selectedText.length : -1,
      x: rect.left - containerRect.left,
      y: rect.bottom - containerRect.top + 4,
    });
  }, [doc]);

  async function submitInlineComment() {
    if (!selection || !doc || !newCommentBody.trim()) return;
    const currentVersion = versions.find((v) => v.versionNumber === doc.versionNumber);
    if (!currentVersion) return;
    setSubmittingComment(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/documents/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId: currentVersion.id,
          body: newCommentBody.trim(),
          anchorStart: selection.start >= 0 ? selection.start : null,
          anchorEnd: selection.end >= 0 ? selection.end : null,
        }),
      });
      if (res.ok) {
        const comment: InlineComment = await res.json();
        setComments((prev) => [...prev, comment]);
        setSelection(null);
        setNewCommentBody('');
        window.getSelection()?.removeAllRanges();
      } else {
        const data = await res.json().catch(() => ({}));
        setCommentError(data.error ?? 'Failed to save comment');
      }
    } catch {
      setCommentError('Failed to save comment');
    } finally {
      setSubmittingComment(false);
    }
  }

  async function resolveComment(commentId: string) {
    const res = await fetch(`/api/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    });
    if (res.ok) {
      const updated: InlineComment = await res.json();
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
    }
  }

  function renderAnnotatedContent(content: string) {
    if (comments.length === 0) {
      return <span>{content}</span>;
    }

    const ranges = comments
      .filter((c) => c.anchorStart !== null && c.anchorEnd !== null)
      .map((c) => ({ start: c.anchorStart!, end: c.anchorEnd!, comment: c }));

    if (ranges.length === 0) return <span>{content}</span>;

    const boundaries = new Set<number>([0, content.length]);
    for (const r of ranges) {
      boundaries.add(Math.max(0, r.start));
      boundaries.add(Math.min(content.length, r.end));
    }
    const sorted = Array.from(boundaries).sort((a, b) => a - b);

    const segments: { text: string; start: number; end: number }[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      segments.push({ text: content.slice(sorted[i], sorted[i + 1]), start: sorted[i], end: sorted[i + 1] });
    }

    return (
      <>
        {segments.map((seg, i) => {
          const matchingComments = ranges.filter((r) => r.start <= seg.start && r.end >= seg.end);
          const hasOpen = matchingComments.some((r) => r.comment.status === 'open');
          const hasResolved = matchingComments.some((r) => r.comment.status === 'resolved');
          const isActive = activeAnchor &&
            matchingComments.some((r) => r.comment.anchorStart === activeAnchor.start && r.comment.anchorEnd === activeAnchor.end);
          if (matchingComments.length === 0) return <span key={i}>{seg.text}</span>;
          const firstComment = matchingComments[0].comment;
          return (
            <mark
              key={i}
              onMouseUp={(e) => e.stopPropagation()}
              onClick={() =>
                setActiveAnchor((prev) =>
                  prev?.start === firstComment.anchorStart && prev?.end === firstComment.anchorEnd
                    ? null
                    : { start: firstComment.anchorStart!, end: firstComment.anchorEnd! }
                )
              }
              className={`cursor-pointer rounded px-0.5 ${
                isActive
                  ? 'bg-yellow-300'
                  : hasOpen
                  ? 'bg-yellow-100 hover:bg-yellow-200'
                  : hasResolved
                  ? 'bg-gray-100 hover:bg-gray-200 opacity-60'
                  : ''
              }`}
              title="Click to view comments"
            >
              {seg.text}
            </mark>
          );
        })}
      </>
    );
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!doc) return null;

  const currentVersion = versions.find((v) => v.versionNumber === doc.versionNumber);
  const activeComments = activeAnchor
    ? comments.filter(
        (c) => c.anchorStart === activeAnchor.start && c.anchorEnd === activeAnchor.end
      )
    : [];

  return (
    <div className="max-w-5xl">
      <div className="mb-4">
        <Link href={`/projects/${slug}/board`} className="text-sm text-indigo-600 hover:underline">
          ← Board
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold text-gray-900">{doc.title}</h1>
          <span className="flex-shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            v{doc.versionNumber}
          </span>
        </div>
        <div className="text-xs text-gray-400">
          Last updated {new Date(doc.updatedAt).toLocaleString()}
        </div>

        {versions.length > 1 && (
          <div className="mt-4 flex gap-2 border-b border-gray-100 pb-2">
            <button
              onClick={() => setTab('view')}
              className={`px-3 py-1 text-sm rounded-md ${tab === 'view' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              View
            </button>
            <button
              onClick={() => setTab('diff')}
              className={`px-3 py-1 text-sm rounded-md ${tab === 'diff' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Compare versions
            </button>
          </div>
        )}

        {tab === 'view' && (
          <div className="mt-4 flex gap-4">
            {versions.length > 0 && (
              <div className="w-48 flex-shrink-0">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">History</p>
                <ul className="space-y-1">
                  {[...versions].reverse().map((v) => (
                    <li key={v.id}>
                      <button
                        onClick={() => setSelectedVersion(v.versionNumber === versions[versions.length - 1].versionNumber ? null : v.versionNumber)}
                        className={`w-full rounded px-2 py-1.5 text-left text-xs ${
                          doc.versionNumber === v.versionNumber
                            ? 'bg-indigo-50 text-indigo-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <span className="font-mono">v{v.versionNumber}</span>
                        <span className="ml-1 text-gray-400">
                          {new Date(v.createdAt).toLocaleDateString()}
                        </span>
                        <br />
                        <span className="text-gray-500">{v.authorLabel}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-gray-400">Select text to add a comment.</p>
                <div className="flex overflow-hidden rounded border border-gray-200 text-xs">
                  <button
                    onClick={() => { setSelection(null); setActiveAnchor(null); setViewMode('markdown'); }}
                    className={`px-3 py-1 ${viewMode === 'markdown' ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    Formatted
                  </button>
                  <button
                    onClick={() => { setSelection(null); setActiveAnchor(null); setViewMode('raw'); }}
                    className={`border-l border-gray-200 px-3 py-1 ${viewMode === 'raw' ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    Raw
                  </button>
                </div>
              </div>

              <div className="relative border-t border-gray-100 pt-4">
                {viewMode === 'raw' ? (
                  <pre
                    ref={contentRef}
                    onMouseUp={handleTextSelection}
                    className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-800 select-text"
                  >
                    {renderAnnotatedContent(doc.content)}
                  </pre>
                ) : (
                  <div
                    ref={markdownContentRef}
                    onMouseUp={handleMarkdownSelection}
                    className="prose prose-sm max-w-none select-text text-gray-800"
                  >
                    <Markdown>{doc.content}</Markdown>
                  </div>
                )}

                {selection && (
                  <div
                    className="absolute z-10 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
                    style={{ left: Math.min(selection.x, 400), top: selection.y }}
                  >
                    <p className="mb-2 text-xs font-medium text-gray-600">Add comment</p>
                    <textarea
                      autoFocus
                      value={newCommentBody}
                      onChange={(e) => setNewCommentBody(e.target.value)}
                      rows={3}
                      placeholder="Your comment…"
                      className="w-full resize-none rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                    {commentError && <p className="mt-1 text-xs text-red-600">{commentError}</p>}
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        onClick={() => { setSelection(null); setNewCommentBody(''); setCommentError(null); window.getSelection()?.removeAllRanges(); }}
                        className="rounded px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={submitInlineComment}
                        disabled={submittingComment || !newCommentBody.trim()}
                        className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {submittingComment ? 'Saving…' : 'Comment'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Inline comment highlights panel — raw mode only */}
              {viewMode === 'raw' && activeAnchor && activeComments.length > 0 && (
                <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-yellow-800">
                      Comments on selected range ({activeAnchor.start}–{activeAnchor.end})
                    </p>
                    <button onClick={() => setActiveAnchor(null)} className="text-xs text-yellow-600 hover:text-yellow-800">✕</button>
                  </div>
                  <ul className="space-y-2">
                    {activeComments.map((c) => (
                      <li
                        key={c.id}
                        className={`rounded border p-2 text-sm ${c.status === 'resolved' ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-yellow-200 bg-white'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-medium text-gray-700">{c.authorLabel}</span>
                            <span className="ml-2 text-xs text-gray-400">{new Date(c.createdAt).toLocaleString()}</span>
                            {c.status === 'resolved' && (
                              <span className="ml-2 rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500">resolved</span>
                            )}
                          </div>
                          {c.status === 'open' && (
                            <button onClick={() => resolveComment(c.id)} className="flex-shrink-0 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700">
                              Resolve
                            </button>
                          )}
                        </div>
                        <p className="mt-1 text-gray-700">{c.body}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {viewMode === 'raw' && comments.length > 0 && !activeAnchor && (
                <div className="mt-4 rounded border border-gray-100 bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500">
                    {comments.filter((c) => c.status === 'open').length} open ·{' '}
                    {comments.filter((c) => c.status === 'resolved').length} resolved inline comment
                    {comments.length !== 1 ? 's' : ''}. Click highlighted text to view.
                  </p>
                </div>
              )}

              {/* Comments list — markdown mode */}
              {viewMode === 'markdown' && comments.length > 0 && (
                <div className="mt-6 space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Comments ({comments.filter((c) => c.status === 'open').length} open)
                  </p>
                  {comments.map((c) => (
                    <div
                      key={c.id}
                      className={`rounded-lg border p-3 text-sm ${c.status === 'resolved' ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-yellow-200 bg-yellow-50'}`}
                    >
                      {c.anchorStart !== null && c.anchorEnd !== null && (
                        <blockquote className="mb-2 border-l-2 border-yellow-400 pl-2 font-mono text-xs text-gray-500">
                          {doc.content.slice(c.anchorStart, c.anchorEnd)}
                        </blockquote>
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-medium text-gray-700">{c.authorLabel}</span>
                          <span className="ml-2 text-xs text-gray-400">{new Date(c.createdAt).toLocaleString()}</span>
                          {c.status === 'resolved' && (
                            <span className="ml-2 rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500">resolved</span>
                          )}
                        </div>
                        {c.status === 'open' && (
                          <button onClick={() => resolveComment(c.id)} className="flex-shrink-0 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700">
                            Resolve
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-gray-700">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'diff' && (
          <div className="mt-4">
            <div className="flex items-end gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">From version</label>
                <select
                  value={diffFrom}
                  onChange={(e) => setDiffFrom(Number(e.target.value))}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.versionNumber}>v{v.versionNumber} — {v.authorLabel}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">To version</label>
                <select
                  value={diffTo}
                  onChange={(e) => setDiffTo(Number(e.target.value))}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.versionNumber}>v{v.versionNumber} — {v.authorLabel}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={loadDiff}
                disabled={diffLoading || diffFrom === diffTo}
                className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {diffLoading ? 'Loading…' : 'Show diff'}
              </button>
            </div>

            {diffText !== null && (
              <div className="rounded border border-gray-200 bg-gray-50 p-4 overflow-x-auto">
                <pre className="text-xs leading-relaxed">
                  {diffText.split('\n').map((line, i) => {
                    const color =
                      line.startsWith('+') && !line.startsWith('+++')
                        ? 'text-green-700 bg-green-50'
                        : line.startsWith('-') && !line.startsWith('---')
                        ? 'text-red-700 bg-red-50'
                        : line.startsWith('@@')
                        ? 'text-blue-600'
                        : 'text-gray-700';
                    return (
                      <span key={i} className={`block ${color}`}>
                        {line || ' '}
                      </span>
                    );
                  })}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
