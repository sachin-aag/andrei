import { and, eq, ne, or } from "drizzle-orm";
import { comments } from "@/db/schema";

function isAiSuggestionKind(kind: string): boolean {
  return kind === "ai_fix" || kind === "ai_redraft";
}

/**
 * Live editor / RSC payload. Applied AI suggestions keep a full
 * tableOperation on the comment row for audit — tens of KB per card, and
 * 0.7–8MB after Apply all on an ELR or QSR. The editor only needs open
 * suggestions and human threads.
 */
export function isLiveWorkspaceComment(row: {
  kind: string;
  status: string;
}): boolean {
  if (isAiSuggestionKind(row.kind) && row.status !== "open") return false;
  if (row.status === "dismissed") return false;
  return true;
}

export function slimWorkspaceComments<
  T extends { kind: string; status: string },
>(rows: T[]): T[] {
  return rows.filter(isLiveWorkspaceComment);
}

/** Postgres equivalent of `isLiveWorkspaceComment` so Node never downloads the bodies. */
export function liveWorkspaceCommentsWhere(reportId: string) {
  return and(
    eq(comments.reportId, reportId),
    ne(comments.status, "dismissed"),
    or(
      eq(comments.status, "open"),
      and(ne(comments.kind, "ai_fix"), ne(comments.kind, "ai_redraft"))
    )
  );
}
