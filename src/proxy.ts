import { auth } from "@/auth";
import { NextResponse } from "next/server";

/** Routes reachable without a session (includes Auth.js API for sign-in/out). */
function isPublicAuthRoute(path: string): boolean {
  return (
    path === "/login" ||
    path === "/forgot-password" ||
    path === "/reset-password" ||
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/auth-pw/forgot-password") ||
    path.startsWith("/api/auth-pw/reset-password") ||
    path.startsWith("/api/test/")
  );
}

/** Auth pages only — signed-in users should leave, but /api/auth/* must stay reachable for logout. */
function isSignedInAuthPageRoute(path: string): boolean {
  return (
    path === "/login" ||
    path === "/forgot-password" ||
    path === "/reset-password"
  );
}

function isAllowedWhileMustChangePassword(path: string): boolean {
  return (
    path === "/change-password" ||
    path === "/api/auth-pw/replace-shared-password" ||
    path.startsWith("/api/auth/")
  );
}

export const proxy = auth((req) => {
  const path = req.nextUrl.pathname;

  if (!req.auth) {
    if (isPublicAuthRoute(path)) {
      return NextResponse.next();
    }
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(loginUrl);
  }

  if (req.auth.user.mustChangePassword) {
    if (isAllowedWhileMustChangePassword(path)) {
      return NextResponse.next();
    }
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { error: "You must set a new password before continuing." },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  if (path === "/change-password") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (isSignedInAuthPageRoute(path)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|mj-sync|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
