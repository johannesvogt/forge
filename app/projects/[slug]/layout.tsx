import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/projects/project-service';
import { prisma } from '@/lib/prisma';
import { ProjectProvider } from './project-context';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProject(prisma as any, slug);
  if (!project) notFound();

  const base = `/projects/${slug}`;

  return (
    <ProjectProvider
      project={{
        id: project.id,
        name: project.name,
        slug: project.slug,
        createdAt: project.createdAt.toISOString(),
      }}
    >
      <div className="mb-6 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-6">
          <Link href={base} className="text-sm font-semibold text-gray-900 hover:text-indigo-700">
            {project.name}
          </Link>
          <nav className="flex gap-4">
            {[
              { href: `${base}/board`, label: 'Board' },
              { href: `${base}/documents`, label: 'Documents' },
              { href: `${base}/skills`, label: 'Skills' },
              { href: `${base}/context`, label: 'Context' },
              { href: `${base}/settings`, label: 'Settings' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      {children}
    </ProjectProvider>
  );
}
