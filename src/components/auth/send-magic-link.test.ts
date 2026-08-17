import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

import { signIn } from "next-auth/react";
import {
  MAGIC_LINK_SEND_ERROR,
  sendMagicLinkEmail,
} from "./send-magic-link";

describe("sendMagicLinkEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a Resend magic link without redirecting", async () => {
    vi.mocked(signIn).mockResolvedValueOnce({ ok: true } as never);

    await expect(
      sendMagicLinkEmail("user@mjbiopharm.com", "/reports")
    ).resolves.toEqual({ ok: true });

    expect(signIn).toHaveBeenCalledWith("resend", {
      email: "user@mjbiopharm.com",
      redirectTo: "/reports",
      redirect: false,
    });
  });

  it("returns copy when Auth.js reports an error", async () => {
    vi.mocked(signIn).mockResolvedValueOnce({ error: "EmailSignin" } as never);

    await expect(sendMagicLinkEmail("user@mjbiopharm.com")).resolves.toEqual({
      ok: false,
      error: MAGIC_LINK_SEND_ERROR,
    });
  });

  it("returns copy when the request throws", async () => {
    vi.mocked(signIn).mockRejectedValueOnce(new Error("network"));

    await expect(sendMagicLinkEmail("user@mjbiopharm.com")).resolves.toEqual({
      ok: false,
      error: MAGIC_LINK_SEND_ERROR,
    });
  });
});
