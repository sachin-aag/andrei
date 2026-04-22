import { NextResponse, type NextRequest } from "next/server";
import {
  SITE_ACCESS_COOKIE,
  verifySiteAccessToken,
} from "@/lib/site-access-token";

export async function middleware(request: NextRequest) {
  const secret = process.env.SITE_ACCESS_PASSWORD?.trim();
  if (!secret) {
    return NextResponse.next();
  }

  const path = request.nextUrl.pathname;
  if (path === "/unlock" || path.startsWith("/api/site-access")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SITE_ACCESS_COOKIE)?.value;
  if (token && (await verifySiteAccessToken(token, secret))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/unlock";
  url.searchParams.set(
    "next",
    `${path}${request.nextUrl.search}${request.nextUrl.hash}`,
  );
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Skip Next internals, static assets, and favicon so pages can load branding.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
