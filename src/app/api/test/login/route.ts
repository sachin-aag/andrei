import { createId } from "@paralleldrive/cuid2";
import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/** Upsert the Playwright test engineer when ALLOW_TEST_LOGIN is enabled. */
async function ensureTestWorkspaceUser(email: string) {
  const existing = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.email, email),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(workspaceUsers)
    .values({
      id: createId(),
      name: displayNameFromEmail(email),
      email,
      role: "engineer",
      title: "Test Engineer",
    })
    .onConflictDoNothing({ target: workspaceUsers.email })
    .returning();

  if (created) return created;

  return db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.email, email),
  });
}

function isTestLoginEnabled(): boolean {
  return (
    process.env.ALLOW_TEST_LOGIN === "true" &&
    Boolean(process.env.TEST_AUTH_EMAIL)
  );
}

/**
 * Test-only endpoint: mints a valid Auth.js JWT session cookie directly,
 * bypassing the magic link email flow. Only works when ALLOW_TEST_LOGIN=true
 * and TEST_AUTH_EMAIL is set (Playwright sets both; never enable on Vercel prod).
 *
 * Called by Playwright's loginAsEngineer() helper in CI/dev e2e tests.
 */
export async function POST() {
  const testEmail = process.env.TEST_AUTH_EMAIL;

  if (!isTestLoginEnabled() || !testEmail) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AUTH_SECRET not set" }, { status: 500 });
  }

  const wsUser = await ensureTestWorkspaceUser(testEmail);
  if (!wsUser) {
    return NextResponse.json(
      { error: `No workspace user with email ${testEmail}` },
      { status: 404 }
    );
  }

  // Auth.js uses the cookie name as HMAC salt for key derivation
  const cookieName = "authjs.session-token";
  const jwt = await encode({
    token: {
      sub: wsUser.id,
      email: wsUser.email,
      name: wsUser.name,
      workspaceUserId: wsUser.id,
    },
    secret,
    salt: cookieName,
    maxAge: 60 * 60 * 24,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookieName, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return response;
}
