import { NextRequest } from 'next/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { resolveRequestIdentity } from '@/lib/auth/request-identity';
import { prisma } from '@/lib/prisma';
import { createMcpServer } from '@/mcp/server';

async function handleMcpRequest(request: NextRequest): Promise<Response> {
  const identity = await resolveRequestIdentity(request, { policy: 'agent-only', project: 'principal' });
  if (!identity.ok) return identity.response;

  const server = createMcpServer(prisma, identity.author.authorLabel, identity.projectId);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const POST = handleMcpRequest;
export const GET = handleMcpRequest;
export const DELETE = handleMcpRequest;
