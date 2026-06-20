import { createId } from "@paralleldrive/cuid2";
import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { isTestLoginEnabled } from "@/lib/test/ai-bypass";

const bodySchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(["engineer", "manager"]).optional(),
  mustChangePassword: z.boolean().optional(),
  passwordExpired: z.boolean().optional(),
  passwordWarning: z.boolean().optional(),
});

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function titleForRole(role: "engineer" | "manager"): string {
  return role === "manager" ? "Manager" : "Test Engineer";
}

/** Upsert a Playwright test workspace user when ALLOW_TEST_LOGIN is enabled. */
async function ensureTestWorkspaceUser(
  email: string,
  role: "engineer" | "manager",
  mustChangePassword: boolean,
  passwordExpired: boolean,
  passwordWarning: boolean
) {
  const existing = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.email, email),
  });

  if (existing) {
    const needsUpdate =
      existing.role !== role ||
      existing.mustChangePassword !== mustChangePassword ||
      passwordExpired ||
      passwordWarning ||
      existing.title !== titleForRole(role);

    if (needsUpdate) {
      const passwordFields = passwordExpired || passwordWarning
        ? {
            passwordHash: await hashPassword(
              passwordExpired ? "E2eExpiredPass123!" : "E2eWarningPass123!"
            ),
            passwordChangedAt: new Date(
              Date.now() - (passwordExpired ? 91 : 80) * 24 * 60 * 60 * 1000
            ),
            passwordExpiryWarningDismissedUntil: null,
          }
        : {};
      const [updated] = await db
        .update(workspaceUsers)
        .set({
          role,
          title: titleForRole(role),
          mustChangePassword,
          ...passwordFields,
        })
        .where(eq(workspaceUsers.id, existing.id))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }

  const [created] = await db
    .insert(workspaceUsers)
    .values({
      id: createId(),
      name: displayNameFromEmail(email),
      email,
      role,
      title: titleForRole(role),
      mustChangePassword,
      passwordHash: passwordExpired || passwordWarning
        ? await hashPassword(
            passwordExpired ? "E2eExpiredPass123!" : "E2eWarningPass123!"
          )
        : null,
      passwordChangedAt: passwordExpired || passwordWarning
        ? new Date(
            Date.now() - (passwordExpired ? 91 : 80) * 24 * 60 * 60 * 1000
          )
        : null,
      passwordExpiryWarningDismissedUntil: null,
    })
    .onConflictDoNothing({ target: workspaceUsers.email })
    .returning();

  if (created) return created;

  return db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.email, email),
  });
}

/**
 * Test-only endpoint: mints a valid Auth.js JWT session cookie directly,
 * bypassing the magic link email flow. Only works when ALLOW_TEST_LOGIN=true
 * and TEST_AUTH_EMAIL is set (Playwright sets both; never enable on Vercel prod).
 */
export async function POST(req: Request) {
  if (!isTestLoginEnabled()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const defaultEmail = process.env.TEST_AUTH_EMAIL;
  if (!defaultEmail) {
    return NextResponse.json({ error: "TEST_AUTH_EMAIL not set" }, { status: 500 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AUTH_SECRET not set" }, { status: 500 });
  }

  const rawBody = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(rawBody);
  const email = (parsed.success ? parsed.data.email : undefined) ?? defaultEmail;
  const role = parsed.success ? (parsed.data.role ?? "engineer") : "engineer";
  const mustChangePassword =
    parsed.success ? (parsed.data.mustChangePassword ?? false) : false;
  const passwordExpired =
    parsed.success ? (parsed.data.passwordExpired ?? false) : false;
  const passwordWarning =
    parsed.success ? (parsed.data.passwordWarning ?? false) : false;

  const wsUser = await ensureTestWorkspaceUser(
    email,
    role,
    mustChangePassword,
    passwordExpired,
    passwordWarning
  );
  if (!wsUser) {
    return NextResponse.json(
      { error: `No workspace user with email ${email}` },
      { status: 404 }
    );
  }

  const cookieName = "authjs.session-token";
  const jwt = await encode({
    token: {
      sub: wsUser.id,
      email: wsUser.email,
      name: wsUser.name,
      workspaceUserId: wsUser.id,
      mustChangePassword: wsUser.mustChangePassword,
      passwordExpired,
    },
    secret,
    salt: cookieName,
    maxAge: 60 * 60 * 24,
  });

  const response = NextResponse.json({
    ok: true,
    userId: wsUser.id,
    email: wsUser.email,
    role: wsUser.role,
  });
  response.cookies.set(cookieName, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return response;
}
