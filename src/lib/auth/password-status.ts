import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import {
  computePasswordExpiryState,
  getPasswordPolicy,
} from "@/lib/auth/password-policy";

export type PasswordStatus = {
  expiresAt: string | null;
  daysRemaining: number | null;
  expired: boolean;
  warning: boolean;
};

export async function getPasswordStatusForUser(
  workspaceUserId: string
): Promise<PasswordStatus> {
  const policy = await getPasswordPolicy();
  const user = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.id, workspaceUserId),
    columns: {
      id: true,
      passwordHash: true,
      passwordChangedAt: true,
      passwordExpiryWarningDismissedUntil: true,
    },
  });

  if (!user) {
    return {
      expiresAt: null,
      daysRemaining: null,
      expired: false,
      warning: false,
    };
  }

  const state = computePasswordExpiryState(user, policy);
  return {
    expiresAt: state.expiresAt?.toISOString() ?? null,
    daysRemaining: state.daysRemaining,
    expired: state.expired,
    warning: state.warning,
  };
}
