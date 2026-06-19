export interface Diff {
  id: string;
  title: string;
  description: string;
  branch: string;
  diffText: string;
  issueId: string;
  authorUserId: string | null;
  authorLabel: string;
  createdAt: Date;
}

interface UploadDiffInput {
  title: string;
  description?: string;
  branch: string;
  diffText: string;
  issueId: string;
  authorUserId?: string | null;
  authorLabel: string;
}

interface Db {
  diff: {
    create(args: {
      data: {
        title: string;
        description: string;
        branch: string;
        diffText: string;
        issueId: string;
        authorUserId?: string | null;
        authorLabel: string;
      };
    }): Promise<Diff>;
    findUnique(args: { where: { id: string } }): Promise<Diff | null>;
    findMany(args: {
      where: { issueId: string };
      orderBy: { createdAt: 'asc' | 'desc' };
    }): Promise<Diff[]>;
  };
}

export async function uploadDiff(db: Db, input: UploadDiffInput): Promise<Diff> {
  return db.diff.create({
    data: {
      title: input.title,
      description: input.description ?? '',
      branch: input.branch,
      diffText: input.diffText,
      issueId: input.issueId,
      authorUserId: input.authorUserId ?? null,
      authorLabel: input.authorLabel,
    },
  });
}

export async function getDiff(db: Db, id: string): Promise<Diff | null> {
  return db.diff.findUnique({ where: { id } });
}

export async function listDiffsByIssue(db: Db, issueId: string): Promise<Diff[]> {
  return db.diff.findMany({
    where: { issueId },
    orderBy: { createdAt: 'asc' },
  });
}
