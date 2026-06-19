'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Document {
  id: string;
  title: string;
  content: string;
  versionNumber: number;
  createdAt: string;
  updatedAt: string;
}

export default function DocumentViewerPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/documents/${id}`)
      .then(async (res) => {
        if (res.status === 404) { setError('Document not found.'); return; }
        if (!res.ok) throw new Error('Failed to load document');
        setDoc(await res.json());
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!doc) return null;

  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <Link href="/board" className="text-sm text-indigo-600 hover:underline">
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

        <div className="mt-1 text-xs text-gray-400">
          Last updated {new Date(doc.updatedAt).toLocaleString()}
        </div>

        <div className="mt-6 border-t border-gray-100 pt-4">
          <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-800">
            {doc.content}
          </pre>
        </div>
      </div>
    </div>
  );
}
