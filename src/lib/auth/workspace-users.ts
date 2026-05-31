import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  rowToWorkspaceUser,
  type WorkspaceUser,
} from "@/lib/auth/workspace-user";

export type { UserRole, WorkspaceUser } from "@/lib/auth/workspace-user";

export async function listWorkspaceUsers(): Promise<WorkspaceUser[]> {
  const rows = await db.query.workspaceUsers.findMany({
    orderBy: [asc(schema.workspaceUsers.name)],
  });
  return rows.map(rowToWorkspaceUser);
}

export async function listManagers(): Promise<WorkspaceUser[]> {
  const users = await listWorkspaceUsers();
  return users.filter((user) => user.role === "manager");
}

export async function getWorkspaceUserById(
  id: string | null | undefined
): Promise<WorkspaceUser | undefined> {
  if (!id) return undefined;

  const row = await db.query.workspaceUsers.findFirst({
    where: eq(schema.workspaceUsers.id, id),
  });
  return row ? rowToWorkspaceUser(row) : undefined;
}
