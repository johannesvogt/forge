-- Reject orphan document/issue links and diffs at the database boundary as well
-- as at the projectArtifacts service boundary.
ALTER TABLE "DocumentIssueLink"
  ADD CONSTRAINT "DocumentIssueLink_issueId_fkey"
  FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Diff"
  ADD CONSTRAINT "Diff_issueId_fkey"
  FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
