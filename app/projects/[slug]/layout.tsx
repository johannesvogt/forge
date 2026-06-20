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

  return (
    <ProjectProvider
      project={{
        id: project.id,
        name: project.name,
        slug: project.slug,
        createdAt: project.createdAt.toISOString(),
      }}
    >
      {children}
    </ProjectProvider>
  );
}
