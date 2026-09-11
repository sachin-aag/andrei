import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";

/** SQL fragment to bump `workspace_users.session_version` in the same UPDATE. */
export function nextSessionVersionSql() {
  return sql`${workspaceUsers.sessionVersion} + 1`;
}

/** Invalidate existing JWTs for this workspace user (admin deactivate / forced reset). */
export async function incrementWorkspaceUserSessionVersion(
  userId: string
): Promise<void> {
  await db
    .update(workspaceUsers)
    .set({ sessionVersion: nextSessionVersionSql() })
    .where(eq(workspaceUsers.id, userId));
}
