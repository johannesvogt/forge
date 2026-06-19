'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface SkillFile {
  id: string;
  skillId: string;
  name: string;
  content: string;
  createdAt: string;
}

interface SkillDetail {
  skill: {
    id: string;
    name: string;
    description: string;
    prompt: string;
    createdAt: string;
    updatedAt: string;
  };
  files: SkillFile[];
}

export default function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [saving, setSaving] = useState(false);

  const [showAddFile, setShowAddFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [addingFile, setAddingFile] = useState(false);

  const [deleting, setDeleting] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/skills/${id}`);
      if (!res.ok) throw new Error('Skill not found');
      const data = await res.json();
      setDetail(data);
      setEditDescription(data.skill.description);
      setEditPrompt(data.skill.prompt);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/skills/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: editDescription, prompt: editPrompt }),
      });
      if (!res.ok) throw new Error('Failed to save');
      const updated = await res.json();
      setDetail((prev) => prev ? { ...prev, skill: updated } : prev);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete skill "${detail?.skill.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/skills/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      router.push('/skills');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setDeleting(false);
    }
  }

  async function handleAddFile(e: React.FormEvent) {
    e.preventDefault();
    if (!newFileName.trim()) return;
    setAddingFile(true);
    try {
      const res = await fetch(`/api/skills/${id}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFileName.trim(), content: newFileContent }),
      });
      if (!res.ok) throw new Error('Failed to add file');
      const file = await res.json();
      setDetail((prev) => prev ? { ...prev, files: [...prev.files, file] } : prev);
      setNewFileName('');
      setNewFileContent('');
      setShowAddFile(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setAddingFile(false);
    }
  }

  async function handleDeleteFile(fileId: string, fileName: string) {
    if (!confirm(`Delete file "${fileName}"?`)) return;
    try {
      const res = await fetch(`/api/skills/${id}/files/${fileId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete file');
      setDetail((prev) => prev ? { ...prev, files: prev.files.filter((f) => f.id !== fileId) } : prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!detail) return <p className="text-gray-500">Skill not found.</p>;

  const { skill, files } = detail;

  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <Link href="/skills" className="text-sm text-indigo-600 hover:underline">← Skills</Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 font-mono">{skill.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Updated {new Date(skill.updatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      {editing ? (
        <form onSubmit={handleSave} className="mb-6 rounded-lg border border-indigo-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Edit Skill</h2>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input
              type="text"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Primary Prompt</label>
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              rows={12}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
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
              onClick={() => { setEditing(false); setEditDescription(skill.description); setEditPrompt(skill.prompt); }}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          {skill.description && (
            <p className="mb-3 text-sm text-gray-700 italic">{skill.description}</p>
          )}
          <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono leading-relaxed">{skill.prompt || <span className="text-gray-400">No prompt yet.</span>}</pre>
        </div>
      )}

      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Supporting Files</h2>
          <button
            onClick={() => setShowAddFile(true)}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            + Add File
          </button>
        </div>

        {showAddFile && (
          <form onSubmit={handleAddFile} className="mb-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm space-y-2">
            <input
              type="text"
              placeholder="File name (e.g. ADR-FORMAT.md)"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
              autoFocus
            />
            <textarea
              placeholder="File content (markdown)"
              value={newFileContent}
              onChange={(e) => setNewFileContent(e.target.value)}
              rows={6}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={addingFile}
                className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {addingFile ? 'Adding…' : 'Add File'}
              </button>
              <button
                type="button"
                onClick={() => { setShowAddFile(false); setNewFileName(''); setNewFileContent(''); }}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {files.length === 0 ? (
          <p className="text-sm text-gray-400">No supporting files attached.</p>
        ) : (
          <div className="space-y-3">
            {files.map((file) => (
              <div key={file.id} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-sm font-semibold text-gray-700">{file.name}</span>
                  <button
                    onClick={() => handleDeleteFile(file.id, file.name)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
                <pre className="whitespace-pre-wrap text-xs text-gray-600 font-mono leading-relaxed">{file.content}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
