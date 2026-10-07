/**
 * Deletes Neon preview/* branches older than a cutoff.
 *
 *   NEON_API_KEY=… pnpm tsx scripts/cleanup-stale-neon-preview-branches.ts
 *   NEON_STALE_PREVIEW_BRANCH_MAX_AGE_DAYS=21  (default 14)
 *
 * Leave NEON_PROJECT_ID unset to clean every known pack. Set it to target
 * one project. Pack-specific NEON_PROJECT_ID_* vars override hardcoded ids.
 */
import {
  deleteStaleNeonPreviewBranches,
  isSkippableNeonAccessError,
} from "@/lib/db/neon-preview-branch";
import { resolveNeonPreviewProjectIds } from "@/lib/db/neon-preview-projects";

const apiKey = process.env.NEON_API_KEY?.trim();

if (!apiKey) {
  console.error("NEON_API_KEY is required.");
  process.exit(1);
}

const maxAgeDays = Number.parseInt(
  process.env.NEON_STALE_PREVIEW_BRANCH_MAX_AGE_DAYS ?? "14",
  10
);
const olderThanMs = maxAgeDays * 24 * 60 * 60 * 1000;

async function main() {
  const projects = resolveNeonPreviewProjectIds();
  if (projects.length === 0) {
    console.error("No Neon projects resolved for stale preview cleanup.");
    process.exit(1);
  }

  let hadError = false;
  for (const project of projects) {
    console.error(
      `Deleting Neon preview/* branches older than ${maxAgeDays} day(s) in ${project.label} (${project.id})…`
    );
    try {
      const { deleted, kept } = await deleteStaleNeonPreviewBranches({
        projectId: project.id,
        olderThanMs,
      });
      console.error(
        `[${project.label}] Deleted ${deleted.length} branch(es): ${deleted.join(", ") || "(none)"}`
      );
      console.error(
        `[${project.label}] Kept ${kept.length} recent preview branch(es).`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isSkippableNeonAccessError(error)) {
        console.error(`[${project.label}] skipped: ${message}`);
        continue;
      }
      console.error(`[${project.label}] failed: ${message}`);
      hadError = true;
    }
  }

  if (hadError) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
