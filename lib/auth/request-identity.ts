import type { Project } from '@prisma/client';
import { NextResponse } from 'next/server';
import { extractBearer } from './bearer';

export type IdentityPolicy = 'human-only' | 'agent-only' | 'either';
export type ProjectSelection = 'query' | 'principal' | 'none';

export type HumanPrincipal = {
  kind: 'human';
  userId: string;
  name: string | null;
  email: string | null;
};

export type AgentPrincipal = {
  kind: 'agent';
  userId: string;
  label: string;
  projectId: string;
};

export type RequestPrincipal = HumanPrincipal | AgentPrincipal;
export type CanonicalAuthor = { authorUserId: string | null; authorLabel: string };

export type RequestIdentityContext = {
  principal: RequestPrincipal;
  author: CanonicalAuthor;
  project: Project | null;
  projectId: string;
};

export type RequestIdentityResult =
  | ({ ok: true } & RequestIdentityContext)
  | { ok: false; response: NextResponse };

type SessionIdentity = { user?: { id?: string; name?: string | null; email?: string | null } } | null;
type ActiveKey = { userId: string; label: string; projectId: string };

export type RequestIdentityDependencies = {
  getSession: () => Promise<SessionIdentity>;
  findAgent: (token: string) => Promise<ActiveKey | null>;
  findProject: (id: string) => Promise<Project | null>;
};

function error(message: string, status: number): RequestIdentityResult {
  return { ok: false, response: NextResponse.json({ error: message }, { status }) };
}

/**
 * Builds the request identity seam. Dependency injection keeps the complete
 * policy matrix testable without mocking NextAuth or Prisma.
 */
export function createRequestIdentityResolver(dependencies: RequestIdentityDependencies) {
  return async function resolve(
    request: Request,
    options: { policy: IdentityPolicy; project?: ProjectSelection; projectId?: string | null }
  ): Promise<RequestIdentityResult> {
    const projectSelection = options.project ?? 'query';
    let principal: RequestPrincipal | null = null;

    if (options.policy !== 'agent-only') {
      const session = await dependencies.getSession();
      if (session?.user?.id) {
        principal = {
          kind: 'human',
          userId: session.user.id,
          name: session.user.name ?? null,
          email: session.user.email ?? null,
        };
      }
    }

    if (!principal && options.policy !== 'human-only') {
      const token = extractBearer(request.headers.get('authorization'));
      if (token) {
        const key = await dependencies.findAgent(token);
        if (key) principal = { kind: 'agent', ...key };
      }
    }

    if (!principal) return error('Unauthorized', 401);

    const author: CanonicalAuthor = principal.kind === 'human'
      ? {
          authorUserId: principal.userId,
          authorLabel: principal.name ?? principal.email ?? 'Unknown',
        }
      : { authorUserId: null, authorLabel: principal.label };

    if (projectSelection === 'none') {
      return { ok: true, principal, author, project: null, projectId: '' };
    }

    let projectId: string | null;
    if (projectSelection === 'principal') {
      projectId = principal.kind === 'agent' ? principal.projectId : null;
    } else {
      projectId = options.projectId?.trim()
        || new URL(request.url).searchParams.get('projectId')?.trim()
        || null;
      // Agent keys are project-scoped and must never be usable against another project.
      if (principal.kind === 'agent' && projectId !== principal.projectId) {
        return error('Project not found', 404);
      }
    }

    if (!projectId) return error('projectId is required', 400);
    const project = await dependencies.findProject(projectId);
    if (!project) return error('Project not found', 404);

    return { ok: true, principal, author, project, projectId };
  };
}

export async function resolveRequestIdentity(
  request: Request,
  options: { policy: IdentityPolicy; project?: ProjectSelection; projectId?: string | null },
): Promise<RequestIdentityResult> {
  // Keep concrete framework/database adapters lazy: importing the policy seam is
  // side-effect free and its matrix can be tested without a configured database.
  const [{ getServerSession }, { authOptions }, { findActiveApiKey }, { prisma }] = await Promise.all([
    import('next-auth/next'),
    import('./nextauth-config'),
    import('./api-key-service'),
    import('../prisma'),
  ]);
  return createRequestIdentityResolver({
    getSession: () => getServerSession(authOptions),
    findAgent: (token) => findActiveApiKey(prisma, token),
    findProject: (id) => prisma.project.findUnique({ where: { id } }),
  })(request, options);
}
