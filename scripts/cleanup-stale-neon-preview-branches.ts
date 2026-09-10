/**
 * Deletes Neon preview/* branches older than a cutoff.
 *
 *   NEON_API_KEY=… NEON_PROJECT_ID=… pnpm tsx scripts/cleanup-stale-neon-preview-branches.ts
 *   NEON_STALE_PREVIEW_BRANCH_MAX_AGE_DAYS=21  (default 14)
 */
import { deleteStaleNeonPreviewBranches } from "@/lib/db/neon-preview-branch";

const projectId = process.env.NEON_PROJECT_ID?.trim();
const apiKey = process.env.NEON_API_KEY?.trim();

if (!projectId || !apiKey) {
  console.error("NEON_PROJECT_ID and NEON_API_KEY are required.");
  process.exit(1);
}

const maxAgeDays = Number.parseInt(
  process.env.NEON_STALE_PREVIEW_BRANCH_MAX_AGE_DAYS ?? "14",
  10
);
const olderThanMs = maxAgeDays * 24 * 60 * 60 * 1000;

async function main() {
  const resolvedProjectId = projectId as string;
  console.error(
    `Deleting Neon preview/* branches older than ${maxAgeDays} day(s) in project ${resolvedProjectId}…`
  );
  const { deleted, kept } = await deleteStaleNeonPreviewBranches({
    projectId: resolvedProjectId,
    olderThanMs,
  });
  console.error(`Deleted ${deleted.length} branch(es): ${deleted.join(", ") || "(none)"}`);
  console.error(`Kept ${kept.length} recent preview branch(es).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
