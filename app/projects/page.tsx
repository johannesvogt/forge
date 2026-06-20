import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth/nextauth-config';
import { listProjects } from '@/lib/projects/project-service';
import { prisma } from '@/lib/prisma';

export default async function ProjectsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const projects = await listProjects(prisma as any);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
        <Link
          href="/projects/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="text-sm text-gray-500">No projects yet.</p>
          <Link
            href="/projects/new"
            className="mt-3 inline-block text-sm text-indigo-600 hover:underline"
          >
            Create your first project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.slug}/board`}
              className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <h2 className="text-lg font-medium text-gray-900">{project.name}</h2>
              <p className="mt-1 font-mono text-sm text-gray-400">{project.slug}</p>
              <p className="mt-3 text-xs text-gray-400">
                Created {new Date(project.createdAt).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
