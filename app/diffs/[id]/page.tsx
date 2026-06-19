'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import 'diff2html/bundles/css/diff2html.min.css';

interface DiffDetail {
  id: string;
  title: string;
  description: string;
  branch: string;
  diffText: string;
  issueId: string;
  authorLabel: string;
  authorUserId: string | null;
  createdAt: string;
}

export default function DiffViewerPage() {
  const { id } = useParams<{ id: string }>();
  const [diff, setDiff] = useState<DiffDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const diffContainerRef = useRef<HTMLDivElement>(null);

  const fetchDiff = useCallback(async () => {
    try {
      const res = await fetch(`/api/diffs/${id}`);
      if (res.status === 404) {
        setError('Diff not found.');
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch diff');
      setDiff(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDiff();
  }, [fetchDiff]);

  useEffect(() => {
    if (!diff?.diffText || !diffContainerRef.current) return;

    import('diff2html').then(({ html }) => {
      const rendered = html(diff.diffText, {
        drawFileList: true,
        matching: 'lines',
        outputFormat: 'line-by-line',
      });
      if (diffContainerRef.current) {
        diffContainerRef.current.innerHTML = rendered;
      }
    });
  }, [diff]);

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!diff) return null;

  return (
    <div className="max-w-5xl">
      <div className="mb-4">
        <Link href={`/board/${diff.issueId}`} className="text-sm text-indigo-600 hover:underline">
          ← Issue
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-1 flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold text-gray-900">{diff.title}</h1>
          <span className="flex-shrink-0 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">
            {diff.branch}
          </span>
        </div>
        {diff.description && (
          <p className="mt-1 text-sm text-gray-600">{diff.description}</p>
        )}
        <p className="mt-2 text-xs text-gray-400">
          {diff.authorLabel} · {new Date(diff.createdAt).toLocaleString()}
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
          <span className="text-xs font-medium text-gray-600">Diff</span>
        </div>
        {diff.diffText.trim() ? (
          <div className="overflow-x-auto p-2" ref={diffContainerRef} />
        ) : (
          <p className="px-4 py-6 text-sm text-gray-400 italic">No diff content.</p>
        )}
      </div>
    </div>
  );
}
