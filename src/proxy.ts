import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { expirePostHogCookiesOnResponse } from "@/lib/analytics/posthog-cookies";

/** Routes reachable without a session (includes Auth.js API for sign-in/out). */
function isPublicAuthRoute(path: string): boolean {
  return (
    path === "/login" ||
    path === "/forgot-password" ||
    path === "/reset-password" ||
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/auth-pw/forgot-password") ||
    path.startsWith("/api/auth-pw/reset-password") ||
    path.startsWith("/api/test/") ||
    path.startsWith("/api/internal/document-ingest/")
  );
}

function isAllowedWhileMustChangePassword(path: string): boolean {
  return (
    path === "/change-password" ||
    path === "/login" ||
    path === "/forgot-password" ||
    path === "/reset-password" ||
    path === "/api/auth-pw/replace-shared-password" ||
    path === "/api/auth-pw/change-password" ||
    path === "/api/auth-pw/check-password-reuse" ||
    path.startsWith("/api/auth/")
  );
}

function proxied(
  req: {
    cookies: { getAll: () => Array<{ name: string }> };
    nextUrl: { hostname: string; protocol: string };
  },
  res: NextResponse
): NextResponse {
  expirePostHogCookiesOnResponse(req, res);
  return res;
}

export const proxy = auth((req) => {
  const path = req.nextUrl.pathname;
  const workspaceUserId = req.auth?.user?.workspaceUserId;

  if (!req.auth || !workspaceUserId) {
    if (isPublicAuthRoute(path)) {
      return proxied(req, NextResponse.next());
    }
    if (path.startsWith("/api/")) {
      return proxied(
        req,
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", path);
    return proxied(req, NextResponse.redirect(loginUrl));
  }

  if (req.auth.user.mustChangePassword || req.auth.user.passwordExpired) {
    if (isAllowedWhileMustChangePassword(path)) {
      return proxied(req, NextResponse.next());
    }
    if (path.startsWith("/api/")) {
      return proxied(
        req,
        NextResponse.json(
          { error: "You must set a new password before continuing." },
          { status: 403 }
        )
      );
    }
    return proxied(
      req,
      NextResponse.redirect(new URL("/change-password", req.url))
    );
  }

  if (path === "/change-password") {
    return proxied(req, NextResponse.redirect(new URL("/", req.url)));
  }

  return proxied(req, NextResponse.next());
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|mj-sync|\\.well-known/workflow|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
