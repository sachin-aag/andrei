import { describe, expect, it } from "vitest";
import {
  expiredPostHogSetCookie,
  expirePostHogCookiesOnResponse,
  isPostHogCookieName,
  parentCookieDomain,
  posthogCookieNamesFromHeader,
} from "./posthog-cookies";

describe("isPostHogCookieName", () => {
  it("matches PostHog persistence cookies", () => {
    expect(isPostHogCookieName("ph_phc_abc_posthog")).toBe(true);
    expect(isPostHogCookieName("ph_feature_flags")).toBe(true);
    expect(isPostHogCookieName("something_posthog")).toBe(true);
  });

  it("leaves session and site-access cookies alone", () => {
    expect(isPostHogCookieName("authjs.session-token")).toBe(false);
    expect(isPostHogCookieName("__Secure-authjs.session-token")).toBe(false);
    expect(isPostHogCookieName("mjb_site_access")).toBe(false);
  });
});

describe("posthogCookieNamesFromHeader", () => {
  it("extracts unique PostHog names from a mixed Cookie header", () => {
    expect(
      posthogCookieNamesFromHeader(
        "authjs.session-token=jwt; ph_phc_x_posthog=%7B%7D; mjb_site_access=t; ph_phc_x_posthog=%7B%7D"
      )
    ).toEqual(["ph_phc_x_posthog"]);
  });
});

describe("parentCookieDomain", () => {
  it("expires cross-subdomain cookies only on andreihealth.com hosts", () => {
    expect(parentCookieDomain("mj.andreihealth.com")).toBe(".andreihealth.com");
    expect(parentCookieDomain("andreihealth.com")).toBeNull();
    expect(parentCookieDomain("andrei-v2.vercel.app")).toBeNull();
    expect(parentCookieDomain("localhost")).toBeNull();
  });
});

describe("expirePostHogCookiesOnResponse", () => {
  it("appends host and parent Domain expiry without touching the session cookie", () => {
    const appended: string[] = [];
    expirePostHogCookiesOnResponse(
      {
        cookies: {
          getAll: () => [
            { name: "authjs.session-token" },
            { name: "ph_phc_x_posthog" },
          ],
        },
        nextUrl: { hostname: "mj.andreihealth.com", protocol: "https:" },
      },
      { headers: { append: (_name, value) => appended.push(value) } }
    );

    expect(appended).toEqual([
      expiredPostHogSetCookie("ph_phc_x_posthog", { secure: true }),
      expiredPostHogSetCookie("ph_phc_x_posthog", {
        domain: ".andreihealth.com",
        secure: true,
      }),
    ]);
    expect(appended.join(" ")).not.toContain("authjs");
  });
});
