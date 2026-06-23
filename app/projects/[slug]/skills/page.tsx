'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useProject } from '../project-context';

interface Skill {
  id: string;
  name: string;
  description: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

export default function SkillsPage() {
  const { id: projectId, slug } = useProject();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const [loadingSeeds, setLoadingSeeds] = useState(false);

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch(`/api/skills?projectId=${projectId}`);
      if (!res.ok) throw new Error('Failed to fetch skills');
      setSkills(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  async function handleLoadNewSeeds() {
    setLoadingSeeds(true);
    try {
      const res = await fetch(`/api/skills/seed-new?projectId=${projectId}`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to load new seeds');
      const { count } = await res.json();
      if (count > 0) await fetchSkills();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoadingSeeds(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/skills?projectId=${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDescription, prompt: newPrompt }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to create skill');
      }
      const skill = await res.json();
      setSkills((prev) => [...prev, skill]);
      setNewName('');
      setNewDescription('');
      setNewPrompt('');
      setShowCreate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <p className="text-gray-500">Loading skills…</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Skills</h1>
        <div className="flex gap-2">
          <button
            onClick={handleLoadNewSeeds}
            disabled={loadingSeeds}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingSeeds ? 'Loading…' : 'Load New Seeds'}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + New Skill
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Create Skill</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <input
              type="text"
              placeholder="Skill name (slug, e.g. my-workflow)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
              autoFocus
            />
            <input
              type="text"
              placeholder="Description (one-liner)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <textarea
              placeholder="Primary prompt (markdown)"
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              rows={6}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                onClick={() => { setShowCreate(false); setNewName(''); setNewDescription(''); setNewPrompt(''); }}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {skills.length === 0 ? (
        <p className="text-gray-500 text-sm">No skills yet. Create one to get started.</p>
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => (
            <Link
              key={skill.id}
              href={`/projects/${slug}/skills/${skill.id}`}
              className="block rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-mono text-sm font-semibold text-indigo-700">{skill.name}</span>
                  {skill.description && (
                    <p className="mt-0.5 text-sm text-gray-600">{skill.description}</p>
                  )}
                </div>
                <span className="ml-4 flex-shrink-0 text-xs text-gray-400">
                  {new Date(skill.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
