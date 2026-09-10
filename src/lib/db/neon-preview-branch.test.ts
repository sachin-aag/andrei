import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canAutoHealStaleNeonPreview,
  deleteNeonPreviewBranchesForGitRef,
  deleteStaleNeonPreviewBranches,
  previewBranchNameCandidates,
} from "@/lib/db/neon-preview-branch";

describe("previewBranchNameCandidates", () => {
  it("includes preview/<git-ref> and preview/pr-<n>-<git-ref>", () => {
    expect(
      previewBranchNameCandidates({
        gitRef: "cursor/example",
        prNumber: 42,
      })
    ).toEqual([
      "preview/cursor/example",
      "preview/pr-42-cursor/example",
    ]);
  });

  it("returns only preview/<git-ref> without a PR number", () => {
    expect(
      previewBranchNameCandidates({
        gitRef: "posthog-self-driving/fixchat",
      })
    ).toEqual(["preview/posthog-self-driving/fixchat"]);
  });
});

describe("canAutoHealStaleNeonPreview", () => {
  const originalApiKey = process.env.NEON_API_KEY;
  const originalProjectId = process.env.NEON_PROJECT_ID;

  afterEach(() => {
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

  it("is true when Neon API credentials are present", () => {
    process.env.NEON_API_KEY = "test-key";
    process.env.NEON_PROJECT_ID = "bold-field-45608643";
    expect(canAutoHealStaleNeonPreview()).toBe(true);
  });

  it("is false when credentials are missing", () => {
    delete process.env.NEON_API_KEY;
    delete process.env.NEON_PROJECT_ID;
    expect(canAutoHealStaleNeonPreview()).toBe(false);
  });
});

describe("deleteNeonPreviewBranchesForGitRef", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEON_API_KEY;
    delete process.env.NEON_PROJECT_ID;
  });

  it("deletes matching preview branches via the Neon API", async () => {
    process.env.NEON_API_KEY = "test-key";
    process.env.NEON_PROJECT_ID = "project-1";

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/projects/project-1/branches") && !init?.method) {
        return new Response(
          JSON.stringify({
            branches: [
              { id: "br-old", name: "preview/cursor/example" },
              { id: "br-main", name: "main" },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/projects/project-1/branches/br-old") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteNeonPreviewBranchesForGitRef({
      gitRef: "cursor/example",
      prNumber: 99,
    });

    expect(result.deleted).toEqual(["preview/cursor/example"]);
    expect(result.missing).toEqual(["preview/pr-99-cursor/example"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("deleteStaleNeonPreviewBranches", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEON_API_KEY;
  });

  it("deletes only old preview/* branches", async () => {
    process.env.NEON_API_KEY = "test-key";
    const now = Date.parse("2026-09-04T00:00:00.000Z");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/projects/project-1/branches") && !init?.method) {
        return new Response(
          JSON.stringify({
            branches: [
              {
                id: "br-stale",
                name: "preview/old-branch",
                created_at: "2026-08-01T00:00:00.000Z",
              },
              {
                id: "br-fresh",
                name: "preview/fresh-branch",
                created_at: "2026-09-01T00:00:00.000Z",
              },
              {
                id: "br-main",
                name: "main",
                created_at: "2026-01-01T00:00:00.000Z",
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/projects/project-1/branches/br-stale") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteStaleNeonPreviewBranches({
      projectId: "project-1",
      olderThanMs: 14 * 24 * 60 * 60 * 1000,
      now,
    });

    expect(result.deleted).toEqual(["preview/old-branch"]);
    expect(result.kept).toEqual(["preview/fresh-branch"]);
  });
});
