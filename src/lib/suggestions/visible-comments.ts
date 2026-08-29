import { and, eq, like, ne, or } from "drizzle-orm";
import { comments } from "@/db/schema";
import { SUPERSEDED_BY_PREFIX } from "@/lib/suggestions/supersession";

/**
 * Workspace comment load: hide ordinary dismissals, keep superseded
 * dismissals so the engineer can reopen them.
 */
export function commentsVisibleToWorkspaceWhere(reportId: string) {
  return and(
    eq(comments.reportId, reportId),
    or(
      ne(comments.status, "dismissed"),
      like(comments.content, `%${SUPERSEDED_BY_PREFIX}%`)
    )
  );
}
