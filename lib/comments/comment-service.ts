export interface Comment {
  id: string;
  targetType: string;
  targetId: string;
  body: string;
  authorUserId: string | null;
  authorLabel: string;
  status: string;
  createdAt: Date;
  anchorStart: number | null;
  anchorEnd: number | null;
}

interface AddCommentInput {
  targetType: string;
  targetId: string;
  body: string;
  authorUserId?: string | null;
  authorLabel: string;
  anchorStart?: number | null;
  anchorEnd?: number | null;
}

export interface Anchor {
  startOffset: number;
  endOffset: number;
}

interface Db {
  comment: {
    create(args: { data: AddCommentInput & { status?: string } }): Promise<Comment>;
    findMany(args: {
      where: { targetType: string; targetId: string; anchorStart?: number | null; anchorEnd?: number | null };
      orderBy: { createdAt: 'asc' | 'desc' };
    }): Promise<Comment[]>;
    update(args: { where: { id: string }; data: { status: string } }): Promise<Comment>;
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
      anchorStart: input.anchorStart ?? null,
      anchorEnd: input.anchorEnd ?? null,
    },
  });
}

export async function listComments(
  db: Db,
  targetType: string,
  targetId: string,
  anchor?: Anchor
): Promise<Comment[]> {
  const where: { targetType: string; targetId: string; anchorStart?: number | null; anchorEnd?: number | null } = {
    targetType,
    targetId,
  };
  if (anchor !== undefined) {
    where.anchorStart = anchor.startOffset;
    where.anchorEnd = anchor.endOffset;
  }
  return db.comment.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });
}

export async function resolveComment(db: Db, id: string): Promise<Comment> {
  return db.comment.update({
    where: { id },
    data: { status: 'resolved' },
  });
}
