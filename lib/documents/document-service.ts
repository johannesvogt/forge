export interface Document {
  id: string;
  title: string;
  content: string;
  versionNumber: number;
  versionId: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentVersionSummary {
  id: string;
  versionNumber: number;
  authorLabel: string;
  authorUserId: string | null;
  createdAt: Date;
}

interface RawDocument {
  id: string;
  title: string;
  projectId: string;
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
    create(args: { data: { title: string; projectId: string } }): Promise<RawDocument>;
    findUnique(args: { where: { id: string } }): Promise<RawDocument | null>;
    findMany(args: { where: { projectId: string } }): Promise<RawDocument[]>;
    update(args: { where: { id: string }; data: { updatedAt: Date } }): Promise<RawDocument>;
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
      where: { documentId: string; versionNumber?: number };
      orderBy: { versionNumber: 'asc' | 'desc' };
    }): Promise<RawVersion | null>;
    findMany(args: {
      where: { documentId: string };
      orderBy: { versionNumber: 'asc' | 'desc' };
    }): Promise<RawVersion[]>;
  };
  documentIssueLink: {
    createMany(args: {
      data: Array<{ documentId: string; issueId: string }>;
      skipDuplicates: boolean;
    }): Promise<{ count: number }>;
    findMany(args: { where: { issueId: string } }): Promise<Array<{ documentId: string; issueId: string }>>;
  };
}

export async function createDocument(db: Db, projectId: string, input: CreateInput): Promise<Document> {
  const doc = await db.document.create({ data: { title: input.title, projectId } });
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
    versionId: version.id,
    projectId: doc.projectId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function getDocument(db: Db, projectId: string, id: string): Promise<Document | null> {
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || doc.projectId !== projectId) return null;
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
    versionId: version.id,
    projectId: doc.projectId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function getDocumentAtVersion(
  db: Db,
  projectId: string,
  id: string,
  versionNumber: number
): Promise<Document | null> {
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || doc.projectId !== projectId) return null;
  const version = await db.documentVersion.findFirst({
    where: { documentId: id, versionNumber },
    orderBy: { versionNumber: 'desc' },
  });
  if (!version) return null;
  return {
    id: doc.id,
    title: doc.title,
    content: version.content,
    versionNumber: version.versionNumber,
    versionId: version.id,
    projectId: doc.projectId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function updateDocument(
  db: Db,
  projectId: string,
  id: string,
  input: { content: string; authorUserId?: string | null; authorLabel: string }
): Promise<Document | null> {
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || doc.projectId !== projectId) return null;

  const latest = await db.documentVersion.findFirst({
    where: { documentId: id },
    orderBy: { versionNumber: 'desc' },
  });
  const nextVersionNumber = (latest?.versionNumber ?? 0) + 1;

  const version = await db.documentVersion.create({
    data: {
      documentId: id,
      versionNumber: nextVersionNumber,
      content: input.content,
      authorUserId: input.authorUserId ?? null,
      authorLabel: input.authorLabel,
    },
  });

  const now = new Date();
  const updatedDoc = await db.document.update({ where: { id }, data: { updatedAt: now } });

  return {
    id: updatedDoc.id,
    title: updatedDoc.title,
    content: version.content,
    versionNumber: version.versionNumber,
    versionId: version.id,
    projectId: updatedDoc.projectId,
    createdAt: updatedDoc.createdAt,
    updatedAt: updatedDoc.updatedAt,
  };
}

export async function listDocumentVersions(
  db: Db,
  projectId: string,
  id: string
): Promise<DocumentVersionSummary[]> {
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || doc.projectId !== projectId) return [];
  const versions = await db.documentVersion.findMany({
    where: { documentId: id },
    orderBy: { versionNumber: 'asc' },
  });
  return versions.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    authorLabel: v.authorLabel,
    authorUserId: v.authorUserId,
    createdAt: v.createdAt,
  }));
}

export async function diffDocumentVersions(
  db: Db,
  projectId: string,
  id: string,
  fromVersion: number,
  toVersion: number
): Promise<string | null> {
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || doc.projectId !== projectId) return null;

  const [from, to] = await Promise.all([
    db.documentVersion.findFirst({ where: { documentId: id, versionNumber: fromVersion }, orderBy: { versionNumber: 'desc' } }),
    db.documentVersion.findFirst({ where: { documentId: id, versionNumber: toVersion }, orderBy: { versionNumber: 'desc' } }),
  ]);

  if (!from || !to) return null;

  return computeUnifiedDiff(from.content, to.content, `v${fromVersion}`, `v${toVersion}`);
}

export async function listDocumentsByIssue(db: Db, projectId: string, issueId: string): Promise<Document[]> {
  const links = await db.documentIssueLink.findMany({ where: { issueId } });
  const docs = await Promise.all(links.map((l) => getDocument(db, projectId, l.documentId)));
  return docs.filter((d): d is Document => d !== null);
}

export async function linkDocumentToIssue(db: Db, projectId: string, documentId: string, issueId: string): Promise<void> {
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc || doc.projectId !== projectId) return;
  await db.documentIssueLink.createMany({
    data: [{ documentId, issueId }],
    skipDuplicates: true,
  });
}

function computeUnifiedDiff(
  fromText: string,
  toText: string,
  fromLabel: string,
  toLabel: string
): string {
  const fromLines = fromText.split('\n');
  const toLines = toText.split('\n');
  const m = fromLines.length;
  const n = toLines.length;

  // Build LCS DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        fromLines[i - 1] === toLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to get edit script
  type Op = { op: '+' | '-' | ' '; line: string };
  const ops: Op[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && fromLines[i - 1] === toLines[j - 1]) {
      ops.unshift({ op: ' ', line: fromLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ op: '+', line: toLines[j - 1] });
      j--;
    } else {
      ops.unshift({ op: '-', line: fromLines[i - 1] });
      i--;
    }
  }

  const header = `--- ${fromLabel}\n+++ ${toLabel}\n`;
  if (ops.every((o) => o.op === ' ')) return header;

  const CONTEXT = 3;

  // Mark each op as in-hunk if it's a change or within CONTEXT lines of one
  const inHunk = new Array(ops.length).fill(false);
  for (let x = 0; x < ops.length; x++) {
    if (ops[x].op !== ' ') {
      const lo = Math.max(0, x - CONTEXT);
      const hi = Math.min(ops.length - 1, x + CONTEXT);
      for (let c = lo; c <= hi; c++) inHunk[c] = true;
    }
  }

  // Compute cumulative from/to line numbers for each op
  const opFromLine: number[] = new Array(ops.length).fill(0);
  const opToLine: number[] = new Array(ops.length).fill(0);
  let fl = 1, tl = 1;
  for (let x = 0; x < ops.length; x++) {
    opFromLine[x] = fl;
    opToLine[x] = tl;
    if (ops[x].op !== '+') fl++;
    if (ops[x].op !== '-') tl++;
  }

  // Group consecutive in-hunk ops into hunks
  const hunks: string[] = [];
  let x = 0;
  while (x < ops.length) {
    if (!inHunk[x]) { x++; continue; }

    const hunkStart = x;
    while (x < ops.length && inHunk[x]) x++;
    const hunkEnd = x;

    const hunkOps = ops.slice(hunkStart, hunkEnd);
    const fromStart = opFromLine[hunkStart];
    const toStart = opToLine[hunkStart];
    const fromCount = hunkOps.filter((o) => o.op !== '+').length;
    const toCount = hunkOps.filter((o) => o.op !== '-').length;

    const hunkHeader = `@@ -${fromStart},${fromCount} +${toStart},${toCount} @@\n`;
    const hunkBody = hunkOps.map((o) => `${o.op}${o.line}`).join('\n') + '\n';
    hunks.push(hunkHeader + hunkBody);
  }

  return header + hunks.join('');
}
