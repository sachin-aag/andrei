import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PASSWORD_RESET_SEND_ERROR,
  sendPasswordResetEmail,
} from "./send-password-reset";

describe("sendPasswordResetEmail", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("posts the email to the forgot-password route", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));

    await expect(
      sendPasswordResetEmail("locked@mjbiopharm.com")
    ).resolves.toEqual({ ok: true });

    expect(fetch).toHaveBeenCalledWith("/api/auth-pw/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "locked@mjbiopharm.com" }),
    });
  });

  it("returns copy when the route fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "nope" }), { status: 500 })
    );

    await expect(sendPasswordResetEmail("user@mjbiopharm.com")).resolves.toEqual({
      ok: false,
      error: PASSWORD_RESET_SEND_ERROR,
    });
  });

  it("returns copy when the request throws", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network"));

    await expect(sendPasswordResetEmail("user@mjbiopharm.com")).resolves.toEqual({
      ok: false,
      error: PASSWORD_RESET_SEND_ERROR,
    });
  });
});
