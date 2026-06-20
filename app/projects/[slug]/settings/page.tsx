'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProject } from '../project-context';

export default function SettingsPage() {
  const { name, slug } = useProject();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`Delete project "${name}"? This will permanently remove all issues, documents, diffs, skills, and context. This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${slug}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to delete project');
      }
      router.push('/projects');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Settings</h1>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">Project</h2>
        <p className="mb-1 text-sm text-gray-700">{name}</p>
        <p className="text-xs text-gray-400 font-mono">{slug}</p>
      </div>

      <div className="mt-6 rounded-lg border border-red-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-red-700">Danger Zone</h2>
        <p className="mb-4 text-sm text-gray-600">
          Deleting this project will permanently remove all associated issues, documents, diffs, skills, and context.
        </p>
        {error && (
          <p className="mb-3 text-sm text-red-600">{error}</p>
        )}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          {deleting ? 'Deleting…' : 'Delete Project'}
        </button>
      </div>
    </div>
  );
}
