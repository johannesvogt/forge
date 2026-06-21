'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useProject } from '../project-context';

interface Document {
  id: string;
  title: string;
  versionNumber: number;
  updatedAt: string;
}

export default function DocumentsPage() {
  const { id: projectId, slug } = useProject();
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/documents?projectId=${projectId}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch documents');
        return r.json();
      })
      .then(setDocs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Documents</h1>

      {loading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-600">Error: {error}</p>}

      {!loading && !error && docs.length === 0 && (
        <p className="text-gray-500">No documents yet.</p>
      )}

      {docs.length > 0 && (
        <ul className="space-y-2">
          {docs.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/projects/${slug}/documents/${doc.id}`}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all"
              >
                <span className="font-medium text-gray-900">{doc.title}</span>
                <span className="text-xs text-gray-400">
                  v{doc.versionNumber} · {new Date(doc.updatedAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
