import { afterEach, describe, expect, it } from "vitest";
import { applyDeploymentAuthUrl } from "./apply-deployment-auth-url";

describe("applyDeploymentAuthUrl", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  function isolatedEnv(
    overrides: Record<string, string | undefined>
  ): NodeJS.ProcessEnv {
    const next = { ...envSnapshot };
    delete next.VERCEL_ENV;
    delete next.VERCEL_URL;
    delete next.VERCEL_BRANCH_URL;
    delete next.VERCEL_PROJECT_PRODUCTION_URL;
    delete next.AUTH_URL;
    delete next.NEXTAUTH_URL;
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete next[key];
      else next[key] = value;
    }
    return next;
  }

  it("pins AUTH_URL to the preview branch alias", () => {
    process.env = isolatedEnv({
      VERCEL_ENV: "preview",
      VERCEL_BRANCH_URL: "andrei-v2-git-feat-team.vercel.app",
      AUTH_URL: "https://mj.andreihealth.com",
    });
    applyDeploymentAuthUrl();
    expect(process.env.AUTH_URL).toBe(
      "https://andrei-v2-git-feat-team.vercel.app"
    );
    expect(process.env.NEXTAUTH_URL).toBe(
      "https://andrei-v2-git-feat-team.vercel.app"
    );
  });

  it("replaces a stale vercel.app AUTH_URL with the production custom domain", () => {
    process.env = isolatedEnv({
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "mj.andreihealth.com",
      AUTH_URL: "https://andrei-v2.vercel.app",
    });
    applyDeploymentAuthUrl();
    expect(process.env.AUTH_URL).toBe("https://mj.andreihealth.com");
    expect(process.env.NEXTAUTH_URL).toBe("https://mj.andreihealth.com");
  });

  it("does not rewrite AUTH_URL off Vercel", () => {
    process.env = isolatedEnv({
      AUTH_URL: "http://localhost:3000",
    });
    applyDeploymentAuthUrl();
    expect(process.env.AUTH_URL).toBe("http://localhost:3000");
  });
});
