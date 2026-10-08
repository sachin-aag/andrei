import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KEEPALIVE_BODY_LIMIT_BYTES,
  bodyFitsKeepalive,
  fetchWithKeepaliveIfSmall,
} from "./keepalive-fetch";

describe("fetchWithKeepaliveIfSmall", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets keepalive for a small JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithKeepaliveIfSmall("/api/x", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "applied" }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/x",
      expect.objectContaining({ keepalive: true })
    );
  });

  it("omits keepalive when the body exceeds the Chrome limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const body = "x".repeat(KEEPALIVE_BODY_LIMIT_BYTES + 1);
    expect(bodyFitsKeepalive(body)).toBe(false);

    await fetchWithKeepaliveIfSmall("/api/x", { method: "PATCH", body });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/x",
      expect.objectContaining({ keepalive: false })
    );
  });

  it("honors an explicit keepalive: false for parallel comment PATCHes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithKeepaliveIfSmall("/api/x", {
      method: "PATCH",
      body: JSON.stringify({ status: "resolved" }),
      keepalive: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/x",
      expect.objectContaining({ keepalive: false })
    );
  });

  it("retries a transient Failed to fetch, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithKeepaliveIfSmall("/api/x", {
      method: "PATCH",
      body: "{}",
    });

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry an abort", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithKeepaliveIfSmall("/api/x", { method: "PATCH", body: "{}" })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
