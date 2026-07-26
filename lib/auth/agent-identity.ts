const MAX_AGENT_LABEL_LENGTH = 80;
const AGENT_IDENTITY_HEADER_NAMES = ['agent-key', 'x-agent-key', 'x-agent-identity', 'x-agent-label'];
const AGENT_IDENTITY_ENV_NAMES = ['MCP_AGENT_KEY', 'AGENT_KEY', 'FORGE_AGENT_KEY'];

type HeaderValue = string | string[] | undefined;

function cleanAgentIdentity(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  // Keep labels readable and safe to display in the UI.
  const cleaned = trimmed.replace(/[^a-zA-Z0-9._:@/-]+/g, '-').replace(/-+/g, '-').slice(0, MAX_AGENT_LABEL_LENGTH);
  return cleaned || null;
}

function getHeader(headers: Record<string, HeaderValue> | undefined, name: string): string | null {
  if (!headers) return null;
  const lowerName = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === lowerName);
  if (!entry) return null;
  const value = entry[1];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function agentLabelFromHeaders(headers: Record<string, HeaderValue> | undefined, fallback: string): string {
  for (const headerName of AGENT_IDENTITY_HEADER_NAMES) {
    const label = cleanAgentIdentity(getHeader(headers, headerName));
    if (label) return label;
  }
  return fallback;
}

export function agentLabelFromEnv(env: Record<string, string | undefined>, fallback: string): string {
  for (const envName of AGENT_IDENTITY_ENV_NAMES) {
    const label = cleanAgentIdentity(env[envName]);
    if (label) return label;
  }
  return fallback;
}
