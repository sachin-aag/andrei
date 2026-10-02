import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RESEND_FROM,
  resolveResendFromAddress,
  sendResetEmail,
} from "./send-reset-email";

describe("sendResetEmail", () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
    vi.restoreAllMocks();
  });

  function stubAuthEnv(overrides: Record<string, string | undefined> = {}) {
    process.env = {
      ...env,
      AUTH_RESEND_KEY: "re_test",
      AUTH_URL: "https://andrei-v2.vercel.app",
      AUTH_EMAIL_FROM: "noreply@andreihealth.com",
      ...overrides,
    };
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_BRANCH_URL;
    delete process.env.VERCEL_URL;
  }

  it("builds reset links from AUTH_URL", async () => {
    stubAuthEnv();

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendResetEmail("user@mjbiopharm.com", "token-abc");

    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string
    ) as { html: string; text: string };
    expect(body.html).toContain(
      "https://andrei-v2.vercel.app/reset-password?token=token-abc&email=user%40mjbiopharm.com"
    );
    expect(body.text).toContain(
      "https://andrei-v2.vercel.app/reset-password?token=token-abc&email=user%40mjbiopharm.com"
    );
    expect(body.html).not.toContain("andreihealth.com/reset-password");
  });

  it("strips quoted AUTH_EMAIL_FROM values", () => {
    expect(resolveResendFromAddress('"noreply@andreihealth.com"')).toBe(
      DEFAULT_RESEND_FROM
    );
    expect(resolveResendFromAddress("")).toBe(DEFAULT_RESEND_FROM);
  });

  it("retries with the verified Andrei from address after a 403", async () => {
    stubAuthEnv({ AUTH_EMAIL_FROM: "noreply@3xper.com" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () =>
          JSON.stringify({
            statusCode: 403,
            message: "The 3xper.com domain is not verified.",
          }),
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await sendResetEmail("sachin@andreihealth.com", "token-abc");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string
    ) as { from: string };
    const second = JSON.parse(
      (fetchMock.mock.calls[1]?.[1] as RequestInit).body as string
    ) as { from: string };
    expect(first.from).toBe("noreply@3xper.com");
    expect(second.from).toBe(DEFAULT_RESEND_FROM);
  });

  it("does not retry a 403 when already using the default from", async () => {
    stubAuthEnv();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "sandbox only",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendResetEmail("sachin@andreihealth.com", "token-abc")
    ).rejects.toThrow(/Resend API error: 403/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
