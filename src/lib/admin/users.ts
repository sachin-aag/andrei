import { asc } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import type { UserRole } from "@/lib/auth/roles";
import {
  computePasswordExpiryState,
  getPasswordPolicy,
  type PasswordPolicy,
} from "@/lib/auth/password-policy";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title: string;
  hasPassword: boolean;
  mustChangePassword: boolean;
  passwordDaysRemaining: number | null;
  passwordExpired: boolean;
};

export function adminUserFromRow(
  row: typeof workspaceUsers.$inferSelect,
  policy?: PasswordPolicy
): AdminUser {
  const hasPassword = row.passwordHash !== null;
  const expiry =
    policy && hasPassword
      ? computePasswordExpiryState(row, policy)
      : {
          daysRemaining: null,
          expired: false,
        };

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    title: row.title,
    hasPassword,
    mustChangePassword: row.mustChangePassword,
    passwordDaysRemaining: expiry.daysRemaining,
    passwordExpired: expiry.expired,
  };
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const [rows, policy] = await Promise.all([
    db.query.workspaceUsers.findMany({
      orderBy: [asc(workspaceUsers.name)],
    }),
    getPasswordPolicy(),
  ]);
  return rows.map((row) => adminUserFromRow(row, policy));
}
