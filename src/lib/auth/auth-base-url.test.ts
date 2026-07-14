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

  it("uses VERCEL_URL on Vercel Preview even when AUTH_URL is production", () => {
    process.env = {
      ...env,
      VERCEL_ENV: "preview",
      VERCEL_URL: "andrei-demo-git-feature-abc.vercel.app",
      AUTH_URL: "https://andrei-demo.vercel.app",
    };
    expect(authBaseUrl()).toBe(
      "https://andrei-demo-git-feature-abc.vercel.app"
    );
  });

  it("falls back to VERCEL_URL", () => {
    process.env = { ...env, VERCEL_URL: "andrei-v2.vercel.app" };
    delete process.env.AUTH_URL;
    expect(authBaseUrl()).toBe("https://andrei-v2.vercel.app");
  });

  it("falls back to localhost", () => {
    process.env = { ...env };
    delete process.env.AUTH_URL;
    delete process.env.VERCEL_URL;
    expect(authBaseUrl()).toBe("http://localhost:3000");
  });
});
