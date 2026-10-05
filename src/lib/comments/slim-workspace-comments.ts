import { and, eq, ne, notInArray, or } from "drizzle-orm";
import { commentKindEnum, comments } from "@/db/schema";

const AI_COMMENT_KINDS = commentKindEnum.enumValues.filter((kind) =>
  kind.startsWith("ai_")
);

/** Closed `ai_*` rows (fix/redraft plus leftover grammar/tone/removal). */
function isClosedAiComment(row: { kind?: string; status?: string }): boolean {
  return (row.kind ?? "").startsWith("ai_") && row.status !== "open";
}

/**
 * Live editor / RSC payload. Applied AI suggestions keep a full
 * tableOperation on the comment row for audit — tens of KB per card, and
 * 0.7–8MB after Apply all on an ELR or QSR. The editor only needs open
 * suggestions and human threads.
 */
export function isLiveWorkspaceComment(row: {
  kind?: string;
  status?: string;
}): boolean {
  if (isClosedAiComment(row)) return false;
  if (row.status === "dismissed") return false;
  return true;
}

export function slimWorkspaceComments<
  T extends { kind?: string; status?: string },
>(rows: T[]): T[] {
  return rows.filter(isLiveWorkspaceComment);
}

/** Postgres equivalent of `isLiveWorkspaceComment` so Node never downloads the bodies. */
export function liveWorkspaceCommentsWhere(reportId: string) {
  return and(
    eq(comments.reportId, reportId),
    ne(comments.status, "dismissed"),
    // `comment_kind` is a Postgres enum — LIKE/`~~` is not defined on it.
    or(eq(comments.status, "open"), notInArray(comments.kind, AI_COMMENT_KINDS))
  );
}
