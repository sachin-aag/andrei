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
});
