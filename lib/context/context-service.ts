export interface ProjectContext {
  id: string;
  content: string;
  authorLabel: string;
  authorUserId: string | null;
  updatedAt: Date;
}

interface UpdateContextInput {
  content: string;
  authorLabel: string;
  authorUserId?: string | null;
}

export interface UpdateContextResult {
  context: ProjectContext;
  warning?: string;
}

interface Db {
  projectContext: {
    upsert(args: {
      where: { id: string };
      create: { id: string; content: string; authorLabel: string; authorUserId: string | null };
      update: { content: string; authorLabel: string; authorUserId: string | null; updatedAt: Date };
    }): Promise<ProjectContext>;
    findUnique(args: { where: { id: string } }): Promise<ProjectContext | null>;
  };
}

const SINGLETON_ID = 'singleton';
const TOKEN_WARNING_THRESHOLD = 1000;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function getProjectContext(db: Db): Promise<ProjectContext | null> {
  return db.projectContext.findUnique({ where: { id: SINGLETON_ID } });
}

export async function updateProjectContext(
  db: Db,
  input: UpdateContextInput
): Promise<UpdateContextResult> {
  const context = await db.projectContext.upsert({
    where: { id: SINGLETON_ID },
    create: {
      id: SINGLETON_ID,
      content: input.content,
      authorLabel: input.authorLabel,
      authorUserId: input.authorUserId ?? null,
    },
    update: {
      content: input.content,
      authorLabel: input.authorLabel,
      authorUserId: input.authorUserId ?? null,
      updatedAt: new Date(),
    },
  });

  const tokens = estimateTokens(input.content);
  const warning =
    tokens > TOKEN_WARNING_THRESHOLD
      ? `Content is approximately ${tokens} tokens, which exceeds the recommended limit of ${TOKEN_WARNING_THRESHOLD} tokens.`
      : undefined;

  return { context, warning };
}
