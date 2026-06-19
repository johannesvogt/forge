'use client';

import { useState, useEffect, useCallback } from 'react';

interface ProjectContext {
  id: string;
  content: string;
  authorLabel: string;
  authorUserId: string | null;
  updatedAt: string;
}

export default function ContextPage() {
  const [ctx, setCtx] = useState<ProjectContext | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchContext = useCallback(async () => {
    try {
      const res = await fetch('/api/context');
      if (!res.ok) throw new Error('Failed to load context');
      setCtx(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchContext(); }, [fetchContext]);

  function startEdit() {
    setDraft(ctx?.content ?? '');
    setWarning(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setWarning(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setWarning(null);
    try {
      const res = await fetch('/api/context', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to save');
      }
      const { context, warning: w } = await res.json();
      setCtx(context);
      if (w) setWarning(w);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Project Context</h1>
        {!editing && (
          <button
            onClick={startEdit}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Edit
          </button>
        )}
      </div>

      {ctx && (
        <p className="mb-4 text-xs text-gray-400">
          Last updated by <span className="font-medium text-gray-600">{ctx.authorLabel}</span>{' '}
          on {new Date(ctx.updatedAt).toLocaleString()}
        </p>
      )}

      {warning && (
        <div className="mb-4 rounded border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          {warning}
        </div>
      )}

      {editing ? (
        <form onSubmit={handleSave} className="space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={28}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <pre className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-800 font-mono leading-relaxed">
          {ctx?.content || <span className="text-gray-400">No context yet. Click Edit to add one.</span>}
        </pre>
      )}
    </div>
  );
}
