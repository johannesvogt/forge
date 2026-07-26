-- Keep version allocation on the parent row so incrementing it takes a row lock.
ALTER TABLE "Document" ADD COLUMN "latestVersionNumber" INTEGER NOT NULL DEFAULT 1;

-- Preserve the correct counter if this migration is applied to existing data.
UPDATE "Document" d
SET "latestVersionNumber" = COALESCE(
  (SELECT MAX(v."versionNumber") FROM "DocumentVersion" v WHERE v."documentId" = d.id),
  1
);
