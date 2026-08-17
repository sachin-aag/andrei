import { afterEach, describe, expect, it } from "vitest";
import { authBaseUrl, isVercelAppOrigin } from "./auth-base-url";

describe("authBaseUrl", () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
  });

  function isolatedEnv(
    overrides: Record<string, string | undefined>
  ): NodeJS.ProcessEnv {
    const next = { ...env, ...overrides };
    delete next.VERCEL_ENV;
    delete next.VERCEL_URL;
    delete next.VERCEL_BRANCH_URL;
    delete next.VERCEL_PROJECT_PRODUCTION_URL;
    delete next.AUTH_URL;
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete next[key];
      else next[key] = value;
    }
    return next;
  }

  it("prefers AUTH_URL and strips trailing slash", () => {
    process.env = isolatedEnv({ AUTH_URL: "https://andrei-v2.vercel.app/" });
    expect(authBaseUrl()).toBe("https://andrei-v2.vercel.app");
  });

  it("uses VERCEL_BRANCH_URL on Preview even when AUTH_URL is production", () => {
    process.env = isolatedEnv({
      VERCEL_ENV: "preview",
      VERCEL_BRANCH_URL:
        "andrei-demo-git-demo-attachments-sachin-aags-projects.vercel.app",
      VERCEL_URL: "andrei-demo-de30iqsdw-sachin-aags-projects.vercel.app",
      AUTH_URL: "https://demo.andreihealth.com",
    });
    expect(authBaseUrl()).toBe(
      "https://andrei-demo-git-demo-attachments-sachin-aags-projects.vercel.app"
    );
  });

  it("falls back to VERCEL_URL on Preview when branch URL is unset", () => {
    process.env = isolatedEnv({
      VERCEL_ENV: "preview",
      VERCEL_URL: "andrei-demo-git-feature-abc.vercel.app",
      AUTH_URL: "https://andrei-demo.vercel.app",
    });
    expect(authBaseUrl()).toBe(
      "https://andrei-demo-git-feature-abc.vercel.app"
    );
  });

  it("prefers an explicit custom AUTH_URL over a vercel.app production host", () => {
    process.env = isolatedEnv({
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "andrei-v2.vercel.app",
      AUTH_URL: "https://mj.andreihealth.com",
    });
    expect(authBaseUrl()).toBe("https://mj.andreihealth.com");
  });

  it("uses VERCEL_PROJECT_PRODUCTION_URL over a stale vercel.app AUTH_URL", () => {
    process.env = isolatedEnv({
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "mj.andreihealth.com",
      AUTH_URL: "https://andrei-v2.vercel.app",
    });
    expect(authBaseUrl()).toBe("https://mj.andreihealth.com");
  });

  it("falls back to VERCEL_URL", () => {
    process.env = isolatedEnv({ VERCEL_URL: "andrei-v2.vercel.app" });
    expect(authBaseUrl()).toBe("https://andrei-v2.vercel.app");
  });

  it("falls back to localhost", () => {
    process.env = isolatedEnv({});
    expect(authBaseUrl()).toBe("http://localhost:3000");
  });
});

describe("isVercelAppOrigin", () => {
  it("detects generated Vercel hosts and not custom domains", () => {
    expect(isVercelAppOrigin("https://andrei-v2.vercel.app")).toBe(true);
    expect(isVercelAppOrigin("andrei-v2.vercel.app")).toBe(true);
    expect(isVercelAppOrigin("https://mj.andreihealth.com")).toBe(false);
    expect(isVercelAppOrigin("https://demo.andreihealth.com/")).toBe(false);
  });
});
