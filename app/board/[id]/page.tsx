'use client';

import { useState, useEffect, useCallback } from 'react';
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

export default function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

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

  useEffect(() => { fetchIssue(); }, [fetchIssue]);

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
    </div>
  );
}
