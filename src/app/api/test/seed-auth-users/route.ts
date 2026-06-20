import { createId } from "@paralleldrive/cuid2";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { defaultTitleForRole, type UserRole } from "@/lib/auth/roles";
import { isTestLoginEnabled } from "@/lib/test/ai-bypass";

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

type SeedUser = {
  email: string;
  password?: string;
  role: UserRole;
  mustChangePassword?: boolean;
};

const SEED_USERS: SeedUser[] = [
  { email: "e2e.password@mjbiopharm.com", password: "E2eTestPass123!", role: "engineer" },
  { email: "e2e.lockout@mjbiopharm.com", password: "E2eLockoutPass123!", role: "engineer" },
  { email: "e2e.nopassword@mjbiopharm.com", role: "engineer" },
  {
    email: "e2e.mustchange@mjbiopharm.com",
    password: "E2eTempPass123!",
    role: "engineer",
    mustChangePassword: true,
  },
  { email: "test.manager@mjbiopharm.com", role: "manager" },
  { email: "test.admin@mjbiopharm.com", role: "admin" },
];

async function upsertSeedUser(user: SeedUser) {
  const email = user.email.toLowerCase();
  const passwordHash = user.password ? await hashPassword(user.password) : null;
  const passwordChangedAt = user.password ? new Date() : null;
  const mustChangePassword = user.mustChangePassword ?? false;
  const title = defaultTitleForRole(user.role);

  const existing = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.email, email),
  });

  if (existing) {
    await db
      .update(workspaceUsers)
      .set({
        role: user.role,
        title,
        passwordHash,
        mustChangePassword,
        passwordChangedAt,
        failedLoginAttempts: 0,
        lockedAt: null,
        passwordExpiryWarningDismissedUntil: null,
      })
      .where(eq(workspaceUsers.id, existing.id));
    return existing.id;
  }

  const id = createId();
  await db.insert(workspaceUsers).values({
    id,
    name: displayNameFromEmail(email),
    email,
    role: user.role,
    title,
    passwordHash,
    mustChangePassword,
    passwordChangedAt,
    failedLoginAttempts: 0,
    lockedAt: null,
    passwordExpiryWarningDismissedUntil: null,
  });
  return id;
}

/**
 * Seeds workspace users for password-login E2E tests. Gated like /api/test/login.
 */
export async function POST() {
  if (!isTestLoginEnabled()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const seeded: Array<{ email: string; id: string }> = [];
  for (const user of SEED_USERS) {
    const id = await upsertSeedUser(user);
    seeded.push({ email: user.email, id });
  }

  return NextResponse.json({ ok: true, users: seeded });
}
