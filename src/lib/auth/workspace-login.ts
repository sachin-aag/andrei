import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import type { PasswordExpiryInput } from "@/lib/auth/password-policy";

export type WorkspaceLoginUser = {
  id: string;
  name: string;
  passwordHash: string | null;
  failedLoginAttempts: number;
  lockedAt: Date | null;
  deactivatedAt: Date | null;
};

const CORE_LOGIN_COLUMNS = {
  id: true,
  name: true,
  passwordHash: true,
} as const;

const SECURITY_LOGIN_COLUMNS = {
  ...CORE_LOGIN_COLUMNS,
  failedLoginAttempts: true,
  lockedAt: true,
  deactivatedAt: true,
} as const;

/** Loads a workspace user for credentials login, degrading when security columns are missing. */
export async function findWorkspaceUserForLogin(
  email: string
): Promise<WorkspaceLoginUser | null> {
  try {
    const wsUser = await db.query.workspaceUsers.findFirst({
      where: eq(workspaceUsers.email, email),
      columns: SECURITY_LOGIN_COLUMNS,
    });
    if (!wsUser) return null;
    return {
      id: wsUser.id,
      name: wsUser.name,
      passwordHash: wsUser.passwordHash,
      failedLoginAttempts: wsUser.failedLoginAttempts,
      lockedAt: wsUser.lockedAt,
      deactivatedAt: wsUser.deactivatedAt,
    };
  } catch (error) {
    console.error(
      "workspace user login lookup with security columns failed; retrying core columns",
      error
    );
  }

  const wsUser = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.email, email),
    columns: CORE_LOGIN_COLUMNS,
  });
  if (!wsUser) return null;

  return {
    id: wsUser.id,
    name: wsUser.name,
    passwordHash: wsUser.passwordHash,
    failedLoginAttempts: 0,
    lockedAt: null,
    deactivatedAt: null,
  };
}

export async function recordFailedLoginAttempt(
  userId: string,
  failedLoginAttempts: number,
  locked: boolean
): Promise<void> {
  try {
    await db
      .update(workspaceUsers)
      .set({
        failedLoginAttempts,
        lockedAt: locked ? new Date() : null,
      })
      .where(eq(workspaceUsers.id, userId));
  } catch (error) {
    console.error("failed login lockout update failed", error);
  }
}

export async function clearFailedLoginAttempts(userId: string): Promise<void> {
  try {
    await db
      .update(workspaceUsers)
      .set({ failedLoginAttempts: 0, lockedAt: null })
      .where(eq(workspaceUsers.id, userId));
  } catch (error) {
    console.error("failed login lockout clear failed", error);
  }
}

export async function isWorkspaceUserDeactivated(
  email: string
): Promise<boolean> {
  try {
    const wsUser = await db.query.workspaceUsers.findFirst({
      where: eq(workspaceUsers.email, email),
      columns: { deactivatedAt: true },
    });
    return !!wsUser?.deactivatedAt;
  } catch (error) {
    console.error("deactivated_at lookup failed; treating user as active", error);
    return false;
  }
}

export async function isWorkspaceUserLocked(email: string): Promise<boolean> {
  try {
    const wsUser = await db.query.workspaceUsers.findFirst({
      where: eq(workspaceUsers.email, email),
      columns: { lockedAt: true },
    });
    return !!wsUser?.lockedAt;
  } catch (error) {
    console.error("locked_at lookup failed; treating user as unlocked", error);
    return false;
  }
}

const JWT_STATE_COLUMNS = {
  id: true,
  deactivatedAt: true,
  mustChangePassword: true,
  passwordHash: true,
  passwordChangedAt: true,
  passwordExpiryWarningDismissedUntil: true,
} as const;

const JWT_STATE_FALLBACK_COLUMNS = {
  id: true,
  mustChangePassword: true,
  passwordHash: true,
} as const;

export type WorkspaceJwtUser = PasswordExpiryInput & {
  id: string;
  deactivatedAt: Date | null;
  mustChangePassword: boolean;
};

async function loadJwtState(
  where: NonNullable<Parameters<typeof db.query.workspaceUsers.findFirst>[0]>["where"]
): Promise<WorkspaceJwtUser | null> {
  try {
    const wsUser = await db.query.workspaceUsers.findFirst({
      where,
      columns: JWT_STATE_COLUMNS,
    });
    if (!wsUser) return null;
    return wsUser;
  } catch (error) {
    console.error(
      "workspace user JWT lookup with expiry columns failed; retrying core columns",
      error
    );
  }

  const wsUser = await db.query.workspaceUsers.findFirst({
    where,
    columns: JWT_STATE_FALLBACK_COLUMNS,
  });
  if (!wsUser) return null;

  return {
    ...wsUser,
    deactivatedAt: null,
    passwordChangedAt: null,
    passwordExpiryWarningDismissedUntil: null,
  };
}

export async function loadWorkspaceUserJwtState(
  workspaceUserId: string
): Promise<WorkspaceJwtUser | null> {
  return loadJwtState(eq(workspaceUsers.id, workspaceUserId));
}

export async function loadWorkspaceUserJwtStateByEmail(
  email: string
): Promise<WorkspaceJwtUser | null> {
  return loadJwtState(eq(workspaceUsers.email, email));
}
