-- AlterTable
ALTER TABLE "Issue" ADD COLUMN "doneAt" TIMESTAMP(3);

-- Backfill: approximate doneAt for existing DONE issues using updatedAt
UPDATE "Issue" SET "doneAt" = "updatedAt" WHERE "column" = 'DONE';
