'use client';

import { createContext, useContext } from 'react';

export interface ProjectShape {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

const ProjectContext = createContext<ProjectShape | null>(null);

export function ProjectProvider({
  project,
  children,
}: {
  project: ProjectShape;
  children: React.ReactNode;
}) {
  return <ProjectContext.Provider value={project}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectShape {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
