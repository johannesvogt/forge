'use client';

import { useState, useEffect, useCallback } from 'react';
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

interface Issue {
  id: string;
  title: string;
  description: string;
  column: string;
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
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchIssues = useCallback(async () => {
    try {
      const res = await fetch('/api/issues');
      if (!res.ok) throw new Error('Failed to fetch issues');
      setIssues(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/issues', {
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

  const issuesByColumn = (colId: string) => issues.filter((i) => i.column === colId);

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
        {COLUMNS.map((col) => (
          <div
            key={col.id}
            className={`flex-shrink-0 w-56 rounded-lg border ${columnClass(col.id)} p-3`}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className={`text-xs ${columnHeaderClass(col.id)}`}>{col.label}</span>
              <span className="text-xs text-gray-400">{issuesByColumn(col.id).length}</span>
            </div>
            <div className="space-y-2">
              {issuesByColumn(col.id).map((issue) => (
                <Link
                  key={issue.id}
                  href={`/board/${issue.id}`}
                  className="block rounded-md bg-white border border-gray-200 px-3 py-2 text-sm text-gray-800 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all"
                >
                  <span className="font-medium line-clamp-2">{issue.title}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
