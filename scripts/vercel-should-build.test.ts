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
  it("builds main, cursor/*, demo/*, and convergent/*", () => {
    for (const ref of [
      "main",
      "cursor/mj-pr-previews-23ff",
      "demo/improve_edits",
      "convergent/protocol-pilot",
    ] as const) {
      const result = run({ VERCEL_GIT_COMMIT_REF: ref });
      expect(result.status).toBe(1);
      expect(result.output).toMatch(new RegExp(`building ${ref}`));
    }
  });

  it("skips every other ref, including feat/whitelabel", () => {
    for (const ref of ["feat/whitelabel", "hotfix/something", ""] as const) {
      const result = run({ VERCEL_GIT_COMMIT_REF: ref });
      expect(result.status).toBe(0);
      expect(result.output).toMatch(/skipping/);
    }
  });
});
