export interface Comment {
  id: string;
  targetType: string;
  targetId: string;
  body: string;
  authorUserId: string | null;
  authorLabel: string;
  status: string;
  createdAt: Date;
}

interface AddCommentInput {
  targetType: string;
  targetId: string;
  body: string;
  authorUserId?: string | null;
  authorLabel: string;
}

interface Db {
  comment: {
    create(args: { data: AddCommentInput & { status?: string } }): Promise<Comment>;
    findMany(args: {
      where: { targetType: string; targetId: string };
      orderBy: { createdAt: 'asc' | 'desc' };
    }): Promise<Comment[]>;
  };
}

export async function addComment(db: Db, input: AddCommentInput): Promise<Comment> {
  return db.comment.create({
    data: {
      targetType: input.targetType,
      targetId: input.targetId,
      body: input.body,
      authorUserId: input.authorUserId ?? null,
      authorLabel: input.authorLabel,
      status: 'open',
    },
  });
}

export async function listComments(
  db: Db,
  targetType: string,
  targetId: string
): Promise<Comment[]> {
  return db.comment.findMany({
    where: { targetType, targetId },
    orderBy: { createdAt: 'asc' },
  });
}
