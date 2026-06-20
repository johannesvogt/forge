export function parseCreateProjectBody(body: unknown): { name: string } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b['name'] !== 'string' || b['name'].trim().length === 0) return null;
  return { name: b['name'].trim() };
}

export function formatProject(project: {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}): { id: string; name: string; slug: string; createdAt: Date } {
  return { id: project.id, name: project.name, slug: project.slug, createdAt: project.createdAt };
}
