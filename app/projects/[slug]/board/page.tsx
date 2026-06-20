'use client';

import { useProject } from '../project-context';

export default function ProjectBoardPage() {
  const project = useProject();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">{project.name} — Board</h1>
      <p className="text-sm text-gray-500">Board coming soon.</p>
    </div>
  );
}
