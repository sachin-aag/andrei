import { asc } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import type { UserRole } from "@/lib/auth/roles";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;
  hasPassword: boolean;
  mustChangePassword: boolean;
};

export function adminUserFromRow(
  row: typeof workspaceUsers.$inferSelect
): AdminUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    title: row.title,
    hasPassword: row.passwordHash !== null,
    mustChangePassword: row.mustChangePassword,
  };
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const rows = await db.query.workspaceUsers.findMany({
    orderBy: [asc(workspaceUsers.name)],
  });
  return rows.map(adminUserFromRow);
}
