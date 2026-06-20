'use client';

import Link from 'next/link';
import { useProject } from '../project-context';

export default function DocumentsPage() {
  const { slug } = useProject();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Documents</h1>
      <p className="mt-2 text-gray-500">
        Documents are created and accessed from issue pages.{' '}
        <Link href={`/projects/${slug}/board`} className="text-indigo-600 hover:underline">
          Go to Board
        </Link>
      </p>
    </div>
  );
}
