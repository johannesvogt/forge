import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PrismaClient } from '@prisma/client';
import { findActiveApiKey } from '../lib/auth/api-key-service.ts';
import { createMcpServer } from './server.ts';

const apiKey = process.env['MCP_API_KEY'];
if (!apiKey) {
  process.stderr.write('MCP_API_KEY environment variable is required\n');
  process.exit(1);
}

const prisma = new PrismaClient();

const agent = await findActiveApiKey(prisma, apiKey);
if (!agent) {
  process.stderr.write('Invalid or revoked API key\n');
  await prisma.$disconnect();
  process.exit(1);
}

if (!agent.projectId) {
  process.stderr.write('API key has no associated project\n');
  await prisma.$disconnect();
  process.exit(1);
}

const server = createMcpServer(prisma, agent.label, agent.projectId);
const transport = new StdioServerTransport();
await server.connect(transport);
