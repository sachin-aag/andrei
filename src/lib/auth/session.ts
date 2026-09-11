import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { jwtSessionVersion } from "@/lib/auth/jwt-workspace-state";
import {
  getWorkspaceUserById,
  type WorkspaceUser,
} from "@/lib/auth/workspace-users";

export async function getCurrentUser(): Promise<WorkspaceUser | null> {
  const session = await auth();
  const workspaceUserId = session?.user?.workspaceUserId;
  if (!workspaceUserId) return null;

  try {
    const row = await db.query.workspaceUsers.findFirst({
      where: eq(workspaceUsers.id, workspaceUserId),
      columns: {
        id: true,
        name: true,
        email: true,
        role: true,
        title: true,
        deactivatedAt: true,
        sessionVersion: true,
      },
    });
    if (!row || row.deactivatedAt) return null;
    if (jwtSessionVersion(session.user.sessionVersion) !== row.sessionVersion) {
      return null;
    }
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      title: row.title,
    };
  } catch (error) {
    console.error(
      "workspace user session lookup with security columns failed; retrying identity columns",
      error
    );
  }

  return (await getWorkspaceUserById(workspaceUserId)) ?? null;
}

export async function requireCurrentUser(): Promise<WorkspaceUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthenticated");
  return user;
}
