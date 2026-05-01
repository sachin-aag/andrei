import { beforeEach, describe, expect, it, vi } from "vitest";
import { setSiteAccessCookie } from "@/lib/site-access-cookie";
import { POST } from "@/app/api/site-access/route";

vi.mock("@/lib/site-access-cookie", () => ({
  setSiteAccessCookie: vi.fn(),
}));

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/site-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/site-access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SITE_ACCESS_PASSWORD;
  });

  it("returns 503 when site access is not configured", async () => {
    const response = await POST(jsonRequest({ password: "anything" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Site access is not configured",
    });
  });

  it("rejects invalid payloads", async () => {
    process.env.SITE_ACCESS_PASSWORD = "secret";

    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid payload" });
  });

  it("rejects incorrect passwords", async () => {
    process.env.SITE_ACCESS_PASSWORD = "secret";

    const response = await POST(jsonRequest({ password: "wrong" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Incorrect password",
    });
  });

  it("sets the site access cookie for a correct password", async () => {
    process.env.SITE_ACCESS_PASSWORD = "secret";

    const response = await POST(jsonRequest({ password: "secret" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(setSiteAccessCookie).toHaveBeenCalledOnce();
    expect(vi.mocked(setSiteAccessCookie).mock.calls[0]?.[0]).toMatch(
      /^\d+:[A-Za-z0-9_-]+$/,
    );
  });
});
