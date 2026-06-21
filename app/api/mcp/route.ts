import { NextRequest } from 'next/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { extractBearer } from '@/lib/auth/bearer';
import { findActiveApiKey } from '@/lib/auth/api-key-service';
import { prisma } from '@/lib/prisma';
import { createMcpServer } from '@/mcp/server';

async function authenticate(request: NextRequest) {
  const token = extractBearer(request.headers.get('authorization'));
  if (!token) {
    return { error: new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
  }

  const agent = await findActiveApiKey(prisma, token);
  if (!agent) {
    return { error: new Response(JSON.stringify({ error: 'Invalid or revoked API key' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
  }

  if (!agent.projectId) {
    return { error: new Response(JSON.stringify({ error: 'API key has no associated project' }), { status: 403, headers: { 'Content-Type': 'application/json' } }) };
  }

  return { agent };
}

async function handleMcpRequest(request: NextRequest): Promise<Response> {
  const result = await authenticate(request);
  if (result.error) return result.error;
  const { agent } = result;

  const server = createMcpServer(prisma, agent.label, agent.projectId!);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const POST = handleMcpRequest;
export const GET = handleMcpRequest;
export const DELETE = handleMcpRequest;
