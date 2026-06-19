export interface Document {
  id: string;
  title: string;
  content: string;
  versionNumber: number;
  createdAt: Date;
  updatedAt: Date;
}

interface RawDocument {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

interface RawVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  content: string;
  authorUserId: string | null;
  authorLabel: string;
  createdAt: Date;
}

interface CreateInput {
  title: string;
  content: string;
  issueId: string;
  authorUserId?: string | null;
  authorLabel: string;
}

interface Db {
  document: {
    create(args: { data: { title: string } }): Promise<RawDocument>;
    findUnique(args: { where: { id: string } }): Promise<RawDocument | null>;
  };
  documentVersion: {
    create(args: {
      data: {
        documentId: string;
        versionNumber: number;
        content: string;
        authorUserId?: string | null;
        authorLabel: string;
      };
    }): Promise<RawVersion>;
    findFirst(args: {
      where: { documentId: string };
      orderBy: { versionNumber: 'asc' | 'desc' };
    }): Promise<RawVersion | null>;
  };
  documentIssueLink: {
    createMany(args: {
      data: Array<{ documentId: string; issueId: string }>;
      skipDuplicates: boolean;
    }): Promise<{ count: number }>;
    findMany(args: { where: { issueId: string } }): Promise<Array<{ documentId: string; issueId: string }>>;
  };
}

export async function createDocument(db: Db, input: CreateInput): Promise<Document> {
  const doc = await db.document.create({ data: { title: input.title } });
  const version = await db.documentVersion.create({
    data: {
      documentId: doc.id,
      versionNumber: 1,
      content: input.content,
      authorUserId: input.authorUserId ?? null,
      authorLabel: input.authorLabel,
    },
  });
  await db.documentIssueLink.createMany({
    data: [{ documentId: doc.id, issueId: input.issueId }],
    skipDuplicates: true,
  });
  return {
    id: doc.id,
    title: doc.title,
    content: version.content,
    versionNumber: version.versionNumber,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function getDocument(db: Db, id: string): Promise<Document | null> {
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return null;
  const version = await db.documentVersion.findFirst({
    where: { documentId: id },
    orderBy: { versionNumber: 'desc' },
  });
  if (!version) return null;
  return {
    id: doc.id,
    title: doc.title,
    content: version.content,
    versionNumber: version.versionNumber,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function listDocumentsByIssue(db: Db, issueId: string): Promise<Document[]> {
  const links = await db.documentIssueLink.findMany({ where: { issueId } });
  const docs = await Promise.all(links.map((l) => getDocument(db, l.documentId)));
  return docs.filter((d): d is Document => d !== null);
}

export async function linkDocumentToIssue(db: Db, documentId: string, issueId: string): Promise<void> {
  await db.documentIssueLink.createMany({
    data: [{ documentId, issueId }],
    skipDuplicates: true,
  });
}
