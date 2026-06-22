import { createId } from "@paralleldrive/cuid2";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { initialPasswordHistory } from "@/lib/auth/password-history";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
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

function sanitizeScope(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9-]+/g, "-") : "";
}

function scopedEmail(email: string, scope: string): string {
  if (!scope) return email;
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local}+${scope}@${domain}`;
}

async function upsertSeedUser(user: SeedUser) {
  const email = user.email.toLowerCase();
  const policy = await getPasswordPolicy();
  const passwordHash = user.password ? await hashPassword(user.password) : null;
  const passwordHistory =
    passwordHash !== null
      ? initialPasswordHistory(passwordHash, policy.passwordHistoryLimit)
      : [];
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
        passwordHistory,
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
    passwordHistory,
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
export async function POST(req: Request) {
  if (!isTestLoginEnabled()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const rawBody = await req.json().catch(() => ({}));
  const scope = sanitizeScope((rawBody as { scope?: unknown }).scope);
  const seeded: Array<{ email: string; id: string }> = [];
  for (const user of SEED_USERS) {
    const scopedUser = { ...user, email: scopedEmail(user.email, scope) };
    const id = await upsertSeedUser(scopedUser);
    seeded.push({ email: scopedUser.email, id });
  }

  return NextResponse.json({ ok: true, scope, users: seeded });
}
