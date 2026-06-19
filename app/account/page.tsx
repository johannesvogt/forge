'use client';

import { useState, useEffect, FormEvent } from 'react';

interface ApiKey {
  id: string;
  label: string;
  last4: string;
  createdAt: string;
  revokedAt: string | null;
}

interface NewKey extends ApiKey {
  key: string;
}

export default function AccountPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState<NewKey | null>(null);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function loadKeys() {
    const res = await fetch('/api/account/api-keys');
    if (res.ok) {
      const data: ApiKey[] = await res.json();
      setKeys(data);
    }
  }

  useEffect(() => {
    loadKeys();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    setCreating(true);
    const res = await fetch('/api/account/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    setCreating(false);
    if (res.ok) {
      const data: NewKey = await res.json();
      setNewKey(data);
      setLabel('');
      loadKeys();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to create key');
    }
  }

  async function handleRevoke(id: string) {
    const res = await fetch(`/api/account/api-keys/${id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      loadKeys();
    }
  }

  const activeKeys = keys.filter((k) => !k.revokedAt);
  const revokedKeys = keys.filter((k) => k.revokedAt);

  return (
    <div className="max-w-2xl">
      <h1 className="mb-8 text-2xl font-semibold text-gray-900">Account Settings</h1>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-medium text-gray-900">API Keys</h2>
        <p className="mb-4 text-sm text-gray-600">
          API keys let agents authenticate with Forge. A key is shown once when created — copy it
          immediately.
        </p>

        <form onSubmit={handleCreate} className="mb-6 flex gap-2">
          <input
            type="text"
            placeholder="Key label (e.g. ci-agent)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? 'Generating…' : 'Generate key'}
          </button>
        </form>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {newKey && (
          <div className="mb-6 rounded-md border border-green-200 bg-green-50 p-4">
            <p className="mb-1 text-sm font-medium text-green-800">
              New key: <strong>{newKey.label}</strong> — copy it now, it won&apos;t be shown again.
            </p>
            <code className="block break-all rounded bg-white px-3 py-2 text-sm font-mono text-gray-900 border border-green-200">
              {newKey.key}
            </code>
            <button
              onClick={() => setNewKey(null)}
              className="mt-2 text-xs text-green-700 hover:underline"
            >
              I&apos;ve copied it
            </button>
          </div>
        )}

        {activeKeys.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-500">
                <th className="pb-2">Label</th>
                <th className="pb-2">Last 4</th>
                <th className="pb-2">Created</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {activeKeys.map((k) => (
                <tr key={k.id} className="border-b border-gray-100">
                  <td className="py-2 font-medium text-gray-900">{k.label}</td>
                  <td className="py-2 font-mono text-gray-500">…{k.last4}</td>
                  <td className="py-2 text-gray-500">
                    {new Date(k.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => handleRevoke(k.id)}
                      className="text-red-600 hover:underline"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No active API keys.</p>
        )}

        {revokedKeys.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-gray-500">
              {revokedKeys.length} revoked key{revokedKeys.length !== 1 ? 's' : ''}
            </summary>
            <table className="mt-2 w-full text-sm text-gray-400">
              <tbody>
                {revokedKeys.map((k) => (
                  <tr key={k.id} className="border-b border-gray-100">
                    <td className="py-1 line-through">{k.label}</td>
                    <td className="py-1 font-mono">…{k.last4}</td>
                    <td className="py-1">revoked {new Date(k.revokedAt!).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>
    </div>
  );
}
