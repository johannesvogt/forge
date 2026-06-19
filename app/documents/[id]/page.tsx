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

interface VersionSummary {
  id: string;
  versionNumber: number;
  authorLabel: string;
  authorUserId: string | null;
  createdAt: string;
}

type Tab = 'view' | 'diff';

export default function DocumentViewerPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Document | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('view');
  const [diffFrom, setDiffFrom] = useState<number>(1);
  const [diffTo, setDiffTo] = useState<number>(2);
  const [diffText, setDiffText] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load version list once
  useEffect(() => {
    fetch(`/api/documents/${id}/versions`)
      .then(async (res) => {
        if (!res.ok) return;
        const vs: VersionSummary[] = await res.json();
        setVersions(vs);
        if (vs.length >= 2) {
          setDiffFrom(1);
          setDiffTo(vs[vs.length - 1].versionNumber);
        }
      })
      .catch(() => {});
  }, [id]);

  // Load document content for selected version (or latest)
  useEffect(() => {
    setLoading(true);
    setError(null);
    const url =
      selectedVersion !== null
        ? `/api/documents/${id}?version=${selectedVersion}`
        : `/api/documents/${id}`;
    fetch(url)
      .then(async (res) => {
        if (res.status === 404) { setError('Document not found.'); return; }
        if (!res.ok) throw new Error('Failed to load document');
        setDoc(await res.json());
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false));
  }, [id, selectedVersion]);

  function loadDiff() {
    setDiffLoading(true);
    setDiffText(null);
    fetch(`/api/documents/${id}/diff?from=${diffFrom}&to=${diffTo}`)
      .then(async (res) => {
        if (!res.ok) { setDiffText('Could not compute diff.'); return; }
        const data = await res.json();
        setDiffText(data.diff);
      })
      .catch(() => setDiffText('Failed to load diff.'))
      .finally(() => setDiffLoading(false));
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!doc) return null;

  return (
    <div className="max-w-4xl">
      <div className="mb-4">
        <Link href="/board" className="text-sm text-indigo-600 hover:underline">
          ← Board
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <h1 className="text-xl font-semibold text-gray-900">{doc.title}</h1>
          <span className="flex-shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            v{doc.versionNumber}
          </span>
        </div>
        <div className="text-xs text-gray-400">
          Last updated {new Date(doc.updatedAt).toLocaleString()}
        </div>

        {/* Tabs */}
        {versions.length > 1 && (
          <div className="mt-4 flex gap-2 border-b border-gray-100 pb-2">
            <button
              onClick={() => setTab('view')}
              className={`px-3 py-1 text-sm rounded-md ${tab === 'view' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              View
            </button>
            <button
              onClick={() => setTab('diff')}
              className={`px-3 py-1 text-sm rounded-md ${tab === 'diff' ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Compare versions
            </button>
          </div>
        )}

        {tab === 'view' && (
          <div className="mt-4 flex gap-4">
            {/* Version history sidebar */}
            {versions.length > 0 && (
              <div className="w-48 flex-shrink-0">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">History</p>
                <ul className="space-y-1">
                  {[...versions].reverse().map((v) => (
                    <li key={v.id}>
                      <button
                        onClick={() => setSelectedVersion(v.versionNumber === versions[versions.length - 1].versionNumber ? null : v.versionNumber)}
                        className={`w-full rounded px-2 py-1.5 text-left text-xs ${
                          doc.versionNumber === v.versionNumber
                            ? 'bg-indigo-50 text-indigo-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <span className="font-mono">v{v.versionNumber}</span>
                        <span className="ml-1 text-gray-400">
                          {new Date(v.createdAt).toLocaleDateString()}
                        </span>
                        <br />
                        <span className="text-gray-500">{v.authorLabel}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Content */}
            <div className="min-w-0 flex-1 border-t border-gray-100 pt-4">
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-800">
                {doc.content}
              </pre>
            </div>
          </div>
        )}

        {tab === 'diff' && (
          <div className="mt-4">
            <div className="flex items-end gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">From version</label>
                <select
                  value={diffFrom}
                  onChange={(e) => setDiffFrom(Number(e.target.value))}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.versionNumber}>v{v.versionNumber} — {v.authorLabel}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">To version</label>
                <select
                  value={diffTo}
                  onChange={(e) => setDiffTo(Number(e.target.value))}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.versionNumber}>v{v.versionNumber} — {v.authorLabel}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={loadDiff}
                disabled={diffLoading || diffFrom === diffTo}
                className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {diffLoading ? 'Loading…' : 'Show diff'}
              </button>
            </div>

            {diffText !== null && (
              <div className="rounded border border-gray-200 bg-gray-50 p-4 overflow-x-auto">
                <pre className="text-xs leading-relaxed">
                  {diffText.split('\n').map((line, i) => {
                    const color =
                      line.startsWith('+') && !line.startsWith('+++')
                        ? 'text-green-700 bg-green-50'
                        : line.startsWith('-') && !line.startsWith('---')
                        ? 'text-red-700 bg-red-50'
                        : line.startsWith('@@')
                        ? 'text-blue-600'
                        : 'text-gray-700';
                    return (
                      <span key={i} className={`block ${color}`}>
                        {line || ' '}
                      </span>
                    );
                  })}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
