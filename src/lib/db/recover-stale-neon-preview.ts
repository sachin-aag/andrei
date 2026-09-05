import {
  canAutoHealStaleNeonPreview,
  deleteNeonPreviewBranchesForGitRef,
} from "@/lib/db/neon-preview-branch";

export type StaleNeonPreviewRecoveryResult =
  | { status: "skipped"; reason: string }
  | { status: "deleted"; deleted: string[]; missing: string[] }
  | { status: "failed"; error: string };

export async function recoverStaleNeonPreviewOnAuthFailure(input: {
  gitRef?: string;
  prNumber?: string | number | null;
}): Promise<StaleNeonPreviewRecoveryResult> {
  if (!canAutoHealStaleNeonPreview()) {
    return {
      status: "skipped",
      reason:
        "NEON_API_KEY and NEON_PROJECT_ID are not set on this Vercel project.",
    };
  }

  const gitRef = input.gitRef?.trim();
  if (!gitRef) {
    return {
      status: "skipped",
      reason: "VERCEL_GIT_COMMIT_REF is missing; cannot resolve preview branch.",
    };
  }

  try {
    const { deleted, missing } = await deleteNeonPreviewBranchesForGitRef({
      gitRef,
      prNumber: input.prNumber,
    });
    if (deleted.length === 0) {
      return {
        status: "skipped",
        reason:
          missing.length > 0
            ? `No Neon preview branch found (${missing.join(", ")}).`
            : "No Neon preview branch candidates for this git ref.",
      };
    }
    return { status: "deleted", deleted, missing };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Neon API error";
    return { status: "failed", error: message };
  }
}

export function staleNeonPreviewRecoveryLogLines(
  result: StaleNeonPreviewRecoveryResult
): string[] {
  if (result.status === "skipped") {
    return [`Neon preview auto-heal skipped: ${result.reason}`];
  }
  if (result.status === "failed") {
    return [`Neon preview auto-heal failed: ${result.error}`];
  }
  return [
    `Neon preview auto-heal deleted: ${result.deleted.join(", ")}`,
    ...(result.missing.length > 0
      ? [`Neon preview branch not found (ok): ${result.missing.join(", ")}`]
      : []),
    "Redeploy this Vercel Preview (Redeploy button — no new commit) so Neon injects a fresh DATABASE_URL.",
  ];
}
