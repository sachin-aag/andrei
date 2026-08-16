import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.join(process.cwd(), "scripts/vercel-should-build.sh");

function run(env: Record<string, string>): { status: number; output: string } {
  try {
    const output = execFileSync("bash", [script], {
      env: { ...process.env, VERCEL: "1", ...env },
      encoding: "utf8",
    });
    return { status: 0, output };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: err.status ?? 1,
      output: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
}

describe("vercel-should-build", () => {
  it("builds main on both scopes", () => {
    expect(
      run({
        VERCEL_GIT_COMMIT_REF: "main",
        ANDREI_VERCEL_DEPLOY_SCOPE: "mj",
      }).status
    ).toBe(1);
    expect(
      run({
        VERCEL_GIT_COMMIT_REF: "main",
        ANDREI_VERCEL_DEPLOY_SCOPE: "demo",
      }).status
    ).toBe(1);
  });

  it("builds cursor/* and demo/* on both scopes", () => {
    for (const ref of [
      "cursor/mj-pack-plumbing-23ff",
      "demo/improve_edits",
    ] as const) {
      expect(
        run({
          VERCEL_GIT_COMMIT_REF: ref,
          ANDREI_VERCEL_DEPLOY_SCOPE: "demo",
        }).status
      ).toBe(1);
      const mj = run({
        VERCEL_GIT_COMMIT_REF: ref,
        ANDREI_VERCEL_DEPLOY_SCOPE: "mj",
      });
      expect(mj.status).toBe(1);
      expect(mj.output).toMatch(/building MJ-line branch/);
    }
  });

  it("builds feat/whitelabel on demo only until that branch is deleted", () => {
    expect(
      run({
        VERCEL_GIT_COMMIT_REF: "feat/whitelabel",
        ANDREI_VERCEL_DEPLOY_SCOPE: "demo",
      }).status
    ).toBe(1);
    const mj = run({
      VERCEL_GIT_COMMIT_REF: "feat/whitelabel",
      ANDREI_VERCEL_DEPLOY_SCOPE: "mj",
    });
    expect(mj.status).toBe(0);
    expect(mj.output).toMatch(/not main\/cursor\/\*\/demo\/\*/);
  });

  it("does not build random branches on mj or demo", () => {
    expect(
      run({
        VERCEL_GIT_COMMIT_REF: "hotfix/something",
        ANDREI_VERCEL_DEPLOY_SCOPE: "mj",
      }).status
    ).toBe(0);
    expect(
      run({
        VERCEL_GIT_COMMIT_REF: "hotfix/something",
        ANDREI_VERCEL_DEPLOY_SCOPE: "demo",
      }).status
    ).toBe(0);
  });

  it("skips every branch when scope is unset or unknown", () => {
    expect(
      run({ VERCEL_GIT_COMMIT_REF: "main" }).status
    ).toBe(0);
    expect(
      run({
        VERCEL_GIT_COMMIT_REF: "cursor/foo-23ff",
      }).status
    ).toBe(0);
    expect(
      run({
        VERCEL_GIT_COMMIT_REF: "main",
        ANDREI_VERCEL_DEPLOY_SCOPE: "other",
      }).status
    ).toBe(0);
  });

  it("honors ANDREI_DEMO_PRODUCTION_ONLY against main", () => {
    const skipPr = run({
      VERCEL_GIT_COMMIT_REF: "cursor/foo-23ff",
      ANDREI_VERCEL_DEPLOY_SCOPE: "demo",
      ANDREI_DEMO_PRODUCTION_ONLY: "true",
    });
    expect(skipPr.status).toBe(0);
    expect(skipPr.output).toMatch(/production branch: main/);
    expect(
      run({
        VERCEL_GIT_COMMIT_REF: "main",
        ANDREI_VERCEL_DEPLOY_SCOPE: "demo",
        ANDREI_DEMO_PRODUCTION_ONLY: "true",
      }).status
    ).toBe(1);
  });
});
