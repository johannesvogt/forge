-- Keep version allocation on the parent row so incrementing it is atomic.
ALTER TABLE "Document" ADD COLUMN "latestVersionNumber" INTEGER NOT NULL DEFAULT 1;

-- Preserve the correct counter if this migration is applied to existing data.
UPDATE "Document"
SET "latestVersionNumber" = COALESCE(
  (SELECT MAX("versionNumber") FROM "DocumentVersion" WHERE "documentId" = "Document"."id"),
  1
);
