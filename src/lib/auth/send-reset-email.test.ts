import { afterEach, describe, expect, it, vi } from "vitest";
import { sendResetEmail } from "./send-reset-email";

describe("sendResetEmail", () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
    vi.restoreAllMocks();
  });

  it("builds reset links from AUTH_URL", async () => {
    process.env = {
      ...env,
      AUTH_RESEND_KEY: "re_test",
      AUTH_URL: "https://andrei-v2.vercel.app",
      AUTH_EMAIL_FROM: "noreply@andreihealth.com",
    };

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendResetEmail("user@mjbiopharm.com", "token-abc");

    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string
    ) as { html: string };
    expect(body.html).toContain(
      "https://andrei-v2.vercel.app/reset-password?token=token-abc&email=user%40mjbiopharm.com"
    );
    expect(body.html).not.toContain("andreihealth.com/reset-password");
  });
});
