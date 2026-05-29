import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceUsers } from "@/db/schema";
import { ensureWorkspaceUsersSeeded } from "@/lib/auth/workspace-users";

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

  await ensureWorkspaceUsersSeeded();
  const wsUser = await db.query.workspaceUsers.findFirst({
    where: eq(workspaceUsers.email, testEmail),
  });
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
