/**
 * Deletes Neon preview/<git-ref> branches across customer projects.
 *
 *   NEON_API_KEY=… GIT_REF=feature/foo PR_NUMBER=12 pnpm tsx scripts/cleanup-neon-preview-branch-for-ref.ts
 *
 * Leave NEON_PROJECT_ID unset so every known pack is targeted. Pack-specific
 * NEON_PROJECT_ID_* vars override the hardcoded ids in neon-preview-projects.ts.
 */
import {
  deleteNeonPreviewBranchesForGitRefOnProjects,
  neonPreviewCleanupFailed,
} from "@/lib/db/neon-preview-branch";
import { isProtectedGitRef } from "@/lib/db/neon-preview-projects";

const apiKey = process.env.NEON_API_KEY?.trim();
const gitRef = process.env.GIT_REF?.trim();
const prNumber = process.env.PR_NUMBER?.trim() || undefined;

if (!apiKey) {
  console.error("NEON_API_KEY is required.");
  process.exit(1);
}

if (!gitRef) {
  console.error("GIT_REF is required.");
  process.exit(1);
}

if (isProtectedGitRef(gitRef)) {
  console.error(`Skipping protected git ref ${gitRef}.`);
  process.exit(0);
}

async function main() {
  const resolvedGitRef = gitRef as string;
  console.error(
    `Deleting Neon preview branches for git ref ${resolvedGitRef}` +
      (prNumber ? ` (PR ${prNumber})` : "") +
      "…"
  );

  const { results } = await deleteNeonPreviewBranchesForGitRefOnProjects({
    gitRef: resolvedGitRef,
    prNumber,
  });

  for (const result of results) {
    if (result.error) {
      const kind = result.skipped ? "skipped" : "failed";
      console.error(
        `[${result.label}] ${kind} (${result.projectId}): ${result.error}`
      );
      continue;
    }
    console.error(
      `[${result.label}] deleted: ${result.deleted.join(", ") || "(none)"}; missing: ${result.missing.join(", ") || "(none)"}`
    );
  }

  if (neonPreviewCleanupFailed(results)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
