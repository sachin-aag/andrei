import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RESEND_FROM } from "./resend-email";
import { sendMagicLinkVerificationRequest } from "./send-magic-link-email";

describe("sendMagicLinkVerificationRequest", () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
    vi.restoreAllMocks();
  });

  function stubAuthEnv(overrides: Record<string, string | undefined> = {}) {
    process.env = {
      ...env,
      AUTH_RESEND_KEY: "re_test",
      AUTH_EMAIL_FROM: "noreply@andreihealth.com",
      ANDREI_CUSTOMER: "3xper",
      NEXT_PUBLIC_ANDREI_CUSTOMER: "3xper",
      ANDREI_VERCEL_DEPLOY_SCOPE: "3xper",
      ...overrides,
    };
  }

  it("sends a branded magic-link email through Resend", async () => {
    stubAuthEnv();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const url =
      "https://3xper.andreihealth.com/api/auth/callback/resend?token=abc&email=user%40example.com";
    await sendMagicLinkVerificationRequest({
      identifier: "user@example.com",
      url,
      provider: { apiKey: "re_test", from: "noreply@andreihealth.com" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string
    ) as { from: string; to: string; subject: string; html: string; text: string };
    expect(body.from).toBe(DEFAULT_RESEND_FROM);
    expect(body.to).toBe("user@example.com");
    expect(body.subject).toBe("Sign in to 3xper");
    expect(body.html).toContain(url);
    expect(body.text).toContain(url);
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

    await sendMagicLinkVerificationRequest({
      identifier: "sachin@andreihealth.com",
      url: "https://3xper.andreihealth.com/api/auth/callback/resend?token=abc",
      provider: { from: "noreply@3xper.com" },
    });

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
});
