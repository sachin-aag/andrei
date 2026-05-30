import type { schema } from "@/db";

export type UserRole = "engineer" | "manager";

export type WorkspaceUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;
};

export function rowToWorkspaceUser(
  row: typeof schema.workspaceUsers.$inferSelect
): WorkspaceUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    title: row.title,
  };
}
