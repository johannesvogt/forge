'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useProject } from '../project-context';
import { canTransition, type Column } from '@/lib/issues/state-machine';

const COLUMNS = [
  { id: 'BACKLOG', label: 'Backlog' },
  { id: 'TODO', label: 'Todo' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'NEEDS_HUMAN_REVIEW', label: 'Needs Human Review' },
  { id: 'NEEDS_AGENT_REVIEW', label: 'Needs Agent Review' },
  { id: 'DONE', label: 'Done' },
] as const;

type ColumnId = (typeof COLUMNS)[number]['id'];

interface Issue {
  id: string;
  key: string;
  title: string;
  description: string;
  column: string;
  agentAssignee: string | null;
  createdAt: string;
  updatedAt: string;
}

const REVIEW_COLUMNS: ColumnId[] = ['NEEDS_HUMAN_REVIEW', 'NEEDS_AGENT_REVIEW'];

function columnClass(colId: ColumnId): string {
  if (REVIEW_COLUMNS.includes(colId)) return 'bg-amber-50 border-amber-200';
  if (colId === 'DONE') return 'bg-green-50 border-green-200';
  return 'bg-gray-50 border-gray-200';
}

function columnHeaderClass(colId: ColumnId): string {
  if (REVIEW_COLUMNS.includes(colId)) return 'text-amber-700 font-semibold';
  if (colId === 'DONE') return 'text-green-700 font-semibold';
  return 'text-gray-700 font-semibold';
}

export default function BoardPage() {
  const { id: projectId, slug } = useProject();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);
  const [dragging, setDragging] = useState<{ id: string; column: Column } | null>(null);
  const [dragOverCol, setDragOverCol] = useState<Column | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [forceConfirm, setForceConfirm] = useState<{ issueId: string; from: Column; to: Column } | null>(null);

  const fetchIssues = useCallback(async () => {
    try {
      const res = await fetch(`/api/issues?projectId=${projectId}`);
      if (!res.ok) throw new Error('Failed to fetch issues');
      setIssues(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  useEffect(() => {
    const id = setInterval(() => { if (!dragging) fetchIssues(); }, 5000);
    return () => clearInterval(id);
  }, [fetchIssues, dragging]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/issues?projectId=${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), description: newDesc }),
      });
      if (!res.ok) throw new Error('Failed to create issue');
      setNewTitle('');
      setNewDesc('');
      setShowCreate(false);
      await fetchIssues();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  }

  async function executeMove(issueId: string, targetCol: Column, force: boolean) {
    try {
      const res = await fetch(`/api/issues/${issueId}/move?projectId=${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: targetCol, force }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Move failed');
      }
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : 'Move failed');
      await fetchIssues();
    }
  }

  async function handleDrop(targetCol: Column) {
    if (!dragging) return;
    const source = dragging;
    setDragging(null);
    setDragOverCol(null);
    if (source.column === targetCol) return;

    if (!canTransition(source.column, targetCol)) {
      setForceConfirm({ issueId: source.id, from: source.column, to: targetCol });
      return;
    }

    setIssues(prev => prev.map(i => i.id === source.id ? { ...i, column: targetCol } : i));
    await executeMove(source.id, targetCol, false);
  }

  async function handleForceMove() {
    if (!forceConfirm) return;
    const { issueId, to } = forceConfirm;
    setForceConfirm(null);
    setIssues(prev => prev.map(i => i.id === issueId ? { ...i, column: to } : i));
    await executeMove(issueId, to, true);
  }

  const DONE_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000;
  const issuesByColumn = (colId: string) => {
    const colIssues = issues.filter((i) => i.column === colId);
    if (colId !== 'DONE' || showAllDone) return colIssues;
    const cutoff = Date.now() - DONE_VISIBLE_MS;
    return colIssues.filter((i) => {
      const ts = (i as unknown as { doneAt?: string | null }).doneAt;
      if (!ts) return true;
      return new Date(ts).getTime() >= cutoff;
    });
  };

  const colLabel = (id: string) => COLUMNS.find((c) => c.id === id)?.label ?? id;

  if (loading) return <p className="text-gray-500">Loading board…</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Board</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New Issue
        </button>
      </div>

      {forceConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-lg">
            <h2 className="mb-2 text-base font-semibold text-gray-900">Move outside workflow?</h2>
            <p className="mb-5 text-sm text-gray-500">
              Moving from <span className="font-medium text-gray-700">{colLabel(forceConfirm.from)}</span> to{' '}
              <span className="font-medium text-gray-700">{colLabel(forceConfirm.to)}</span> is not a supported workflow transition.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setForceConfirm(null)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleForceMove}
                className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
              >
                Move anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {moveError && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700 flex items-center justify-between">
          <span>{moveError}</span>
          <button onClick={() => setMoveError(null)} className="ml-4 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {showCreate && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Create Issue</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <input
              type="text"
              placeholder="Issue title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
              autoFocus
            />
            <textarea
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={2}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNewTitle(''); setNewDesc(''); }}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const isValidTarget = dragging ? canTransition(dragging.column, col.id as Column) : false;
          const isDroppable = dragging && dragging.column !== col.id;
          const isActive = dragOverCol === col.id && isDroppable;
          const isForced = isDroppable && !isValidTarget;

          return (
            <div
              key={col.id}
              className={[
                'flex-shrink-0 w-56 rounded-lg border p-3 transition-all',
                columnClass(col.id),
                isActive && isValidTarget ? 'ring-2 ring-indigo-400 border-indigo-300 bg-indigo-50' : '',
                isActive && isForced ? 'ring-2 ring-orange-400 border-orange-300 bg-orange-50' : '',
                isValidTarget && !isActive ? 'ring-1 ring-indigo-200' : '',
              ].join(' ')}
              onDragOver={(e) => {
                if (isDroppable) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }
              }}
              onDragEnter={(e) => {
                if (isDroppable) {
                  e.preventDefault();
                  setDragOverCol(col.id as Column);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverCol(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(col.id as Column);
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className={`text-xs ${columnHeaderClass(col.id)}`}>{col.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">{issuesByColumn(col.id).length}</span>
                  {col.id === 'DONE' && (
                    <button
                      onClick={() => setShowAllDone((v) => !v)}
                      className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
                      title={showAllDone ? 'Hide older issues' : 'Show older issues'}
                    >
                      {showAllDone ? 'less' : 'all'}
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {issuesByColumn(col.id).map((issue) => (
                  <Link
                    key={issue.id}
                    href={`/projects/${slug}/board/${issue.id}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', issue.id);
                      setDragging({ id: issue.id, column: issue.column as Column });
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDragOverCol(null);
                    }}
                    className={[
                      'block rounded-md bg-white border border-gray-200 px-3 py-2 text-sm text-gray-800 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all',
                      dragging?.id === issue.id ? 'opacity-40 cursor-grabbing' : 'cursor-grab',
                    ].join(' ')}
                  >
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <span className="font-mono text-xs text-gray-400">{issue.key}</span>
                      {issue.agentAssignee && (
                        <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" title={`Assigned to ${issue.agentAssignee}`} />
                      )}
                    </div>
                    <span className="font-medium line-clamp-2">{issue.title}</span>
                  </Link>
                ))}
                {isActive && isValidTarget && (
                  <div className="h-8 rounded-md border-2 border-dashed border-indigo-300 bg-indigo-50" />
                )}
                {isActive && isForced && (
                  <div className="h-8 rounded-md border-2 border-dashed border-orange-300 bg-orange-50" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
