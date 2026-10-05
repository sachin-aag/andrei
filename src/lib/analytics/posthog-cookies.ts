/**
 * PostHog JS defaults to `persistence: "localStorage+cookie"`, which copies
 * distinct id, session, and feature-flag payloads into `ph_*` cookies.
 * Those headers ride on every document request (including Edge `proxy.ts`
 * and the report `/edit` RSC). On a long-lived MJ session they can stall
 * or 431 the navigation that shows "Loading report…".
 *
 * Cookie names we own: `authjs.session-token`, `__Secure-authjs.*`,
 * `mjb_site_access`. Never expire those.
 */

export function isPostHogCookieName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("ph_")) return true;
  return trimmed.toLowerCase().includes("posthog");
}

export function posthogCookieNamesFromHeader(cookieHeader: string): string[] {
  const names: string[] = [];
  for (const part of cookieHeader.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name && isPostHogCookieName(name) && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

/** Parent Domain= for `mj.andreihealth.com` cookies PostHog set cross-subdomain. */
export function parentCookieDomain(hostname: string): string | null {
  const host = hostname.trim().toLowerCase();
  if (host === "andreihealth.com" || !host.endsWith(".andreihealth.com")) {
    return null;
  }
  return ".andreihealth.com";
}

export function expiredPostHogSetCookie(
  name: string,
  opts?: { domain?: string; secure?: boolean }
): string {
  let value = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  if (opts?.domain) value += `; Domain=${opts.domain}`;
  if (opts?.secure) value += "; Secure";
  return value;
}

export function expirePostHogCookiesOnResponse(
  req: {
    cookies: { getAll: () => Array<{ name: string }> };
    nextUrl: { hostname: string; protocol: string };
  },
  res: { headers: { append: (name: string, value: string) => void } }
): void {
  const parent = parentCookieDomain(req.nextUrl.hostname);
  const secure = req.nextUrl.protocol === "https:";
  for (const { name } of req.cookies.getAll()) {
    if (!isPostHogCookieName(name)) continue;
    res.headers.append(
      "Set-Cookie",
      expiredPostHogSetCookie(name, { secure })
    );
    if (parent) {
      res.headers.append(
        "Set-Cookie",
        expiredPostHogSetCookie(name, { domain: parent, secure })
      );
    }
  }
}

export function expirePostHogCookiesInBrowser(): void {
  if (typeof document === "undefined") return;
  const names = posthogCookieNamesFromHeader(document.cookie);
  if (names.length === 0) return;
  const hostname = window.location.hostname;
  const parent = parentCookieDomain(hostname);
  const secure = window.location.protocol === "https:";
  for (const name of names) {
    document.cookie = expiredPostHogSetCookie(name, { secure });
    document.cookie = expiredPostHogSetCookie(name, {
      domain: hostname,
      secure,
    });
    if (parent) {
      document.cookie = expiredPostHogSetCookie(name, {
        domain: parent,
        secure,
      });
    }
  }
}
