import { afterEach, describe, expect, it, vi } from "vitest";
import {
  recoverStaleNeonPreviewOnAuthFailure,
  staleNeonPreviewRecoveryLogLines,
} from "@/lib/db/recover-stale-neon-preview";

describe("recoverStaleNeonPreviewOnAuthFailure", () => {
  const originalApiKey = process.env.NEON_API_KEY;
  const originalProjectId = process.env.NEON_PROJECT_ID;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalApiKey === undefined) {
      delete process.env.NEON_API_KEY;
    } else {
      process.env.NEON_API_KEY = originalApiKey;
    }
    if (originalProjectId === undefined) {
      delete process.env.NEON_PROJECT_ID;
    } else {
      process.env.NEON_PROJECT_ID = originalProjectId;
    }
  });

  it("skips when Neon credentials are missing", async () => {
    delete process.env.NEON_API_KEY;
    delete process.env.NEON_PROJECT_ID;

    const result = await recoverStaleNeonPreviewOnAuthFailure({
      gitRef: "cursor/example",
    });

    expect(result.status).toBe("skipped");
  });

  it("deletes preview branches when credentials are present", async () => {
    process.env.NEON_API_KEY = "test-key";
    process.env.NEON_PROJECT_ID = "project-1";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/projects/project-1/branches") && !init?.method) {
          return new Response(
            JSON.stringify({
              branches: [{ id: "br-1", name: "preview/cursor/example" }],
            }),
            { status: 200 }
          );
        }
        if (url.endsWith("/projects/project-1/branches/br-1") && init?.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        return new Response("not found", { status: 404 });
      })
    );

    const result = await recoverStaleNeonPreviewOnAuthFailure({
      gitRef: "cursor/example",
    });

    expect(result).toEqual({
      status: "deleted",
      deleted: ["preview/cursor/example"],
      missing: [],
    });
  });
});

describe("staleNeonPreviewRecoveryLogLines", () => {
  it("includes redeploy guidance after a successful delete", () => {
    const lines = staleNeonPreviewRecoveryLogLines({
      status: "deleted",
      deleted: ["preview/cursor/example"],
      missing: [],
    });
    expect(lines.join("\n")).toMatch(/Redeploy this Vercel Preview/);
  });
});
