import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CommentPersistError,
  patchCommentStatus,
} from "./persist-comment-status";

describe("patchCommentStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 })
    );

    await expect(
      patchCommentStatus("r1", "c1", "dismissed")
    ).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledWith(
      "/api/reports/r1/comments/c1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "dismissed" }),
      })
    );
  });

  it("throws CommentPersistError with 403 message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "Forbidden" }),
      })
    );

    await expect(patchCommentStatus("r1", "c1", "resolved")).rejects.toMatchObject(
      {
        name: "CommentPersistError",
        status: 403,
        message: "Forbidden",
      } satisfies Partial<CommentPersistError>
    );
  });

  it("throws CommentPersistError with default 404 message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      })
    );

    await expect(patchCommentStatus("r1", "c1", "dismissed")).rejects.toEqual(
      expect.objectContaining({
        status: 404,
        message: "This suggestion no longer exists.",
      })
    );
  });

  it("throws CommentPersistError on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(patchCommentStatus("r1", "c1", "dismissed")).rejects.toEqual(
      expect.objectContaining({
        status: 0,
        message: "Could not update suggestion. Please try again.",
      })
    );
  });
});
