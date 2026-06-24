-- Add issueCounter to Project
ALTER TABLE "Project" ADD COLUMN "issueCounter" INTEGER NOT NULL DEFAULT 0;

-- Add key to Issue as nullable first so we can backfill
ALTER TABLE "Issue" ADD COLUMN "key" TEXT;

-- Backfill: assign keys to existing issues ordered by createdAt within each project
WITH ranked AS (
  SELECT
    i.id,
    SUBSTRING(REGEXP_REPLACE(UPPER(p.name), '[^A-Z0-9]', '', 'g') || 'XXXX', 1, 4) AS prefix,
    ROW_NUMBER() OVER (PARTITION BY i."projectId" ORDER BY i."createdAt") AS num
  FROM "Issue" i
  JOIN "Project" p ON p.id = i."projectId"
)
UPDATE "Issue" i
SET "key" = r.prefix || '-' || r.num
FROM ranked r
WHERE i.id = r.id;

-- Sync project counters to match existing issue counts
UPDATE "Project" p
SET "issueCounter" = (SELECT COUNT(*) FROM "Issue" WHERE "projectId" = p.id);

-- Now enforce NOT NULL and UNIQUE
ALTER TABLE "Issue" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "Issue_key_key" ON "Issue"("key");
