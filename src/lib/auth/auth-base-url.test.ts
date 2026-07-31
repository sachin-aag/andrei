import { afterEach, describe, expect, it } from "vitest";
import { authBaseUrl } from "./auth-base-url";

describe("authBaseUrl", () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
  });

  it("prefers AUTH_URL and strips trailing slash", () => {
    process.env = { ...env, AUTH_URL: "https://andrei-v2.vercel.app/" };
    expect(authBaseUrl()).toBe("https://andrei-v2.vercel.app");
  });

  it("uses VERCEL_BRANCH_URL on Preview even when AUTH_URL is production", () => {
    process.env = {
      ...env,
      VERCEL_ENV: "preview",
      VERCEL_BRANCH_URL:
        "andrei-demo-git-demo-attachments-sachin-aags-projects.vercel.app",
      VERCEL_URL: "andrei-demo-de30iqsdw-sachin-aags-projects.vercel.app",
      AUTH_URL: "https://demo.andreihealth.com",
    };
    expect(authBaseUrl()).toBe(
      "https://andrei-demo-git-demo-attachments-sachin-aags-projects.vercel.app"
    );
  });

  it("falls back to VERCEL_URL on Preview when branch URL is unset", () => {
    process.env = {
      ...env,
      VERCEL_ENV: "preview",
      VERCEL_URL: "andrei-demo-git-feature-abc.vercel.app",
      AUTH_URL: "https://andrei-demo.vercel.app",
    };
    delete process.env.VERCEL_BRANCH_URL;
    expect(authBaseUrl()).toBe(
      "https://andrei-demo-git-feature-abc.vercel.app"
    );
  });

  it("falls back to VERCEL_URL", () => {
    process.env = { ...env, VERCEL_URL: "andrei-v2.vercel.app" };
    delete process.env.AUTH_URL;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_BRANCH_URL;
    expect(authBaseUrl()).toBe("https://andrei-v2.vercel.app");
  });

  it("falls back to localhost", () => {
    process.env = { ...env };
    delete process.env.AUTH_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_BRANCH_URL;
    expect(authBaseUrl()).toBe("http://localhost:3000");
  });
});
