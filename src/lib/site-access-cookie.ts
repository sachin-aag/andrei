import { cookies } from "next/headers";
import { SITE_ACCESS_COOKIE } from "@/lib/site-access-token";

export async function setSiteAccessCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SITE_ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSiteAccessCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SITE_ACCESS_COOKIE);
}
