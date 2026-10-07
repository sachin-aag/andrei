import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RESEND_FROM,
  resolveResendFromAddress,
  sendResendEmail,
} from "./resend-email";

describe("resolveResendFromAddress", () => {
  it("strips quoted AUTH_EMAIL_FROM values", () => {
    expect(resolveResendFromAddress('"noreply@andreihealth.com"')).toBe(
      DEFAULT_RESEND_FROM
    );
    expect(resolveResendFromAddress("")).toBe(DEFAULT_RESEND_FROM);
  });
});

describe("sendResendEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries with the verified Andrei from address after a 403", async () => {
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

    await sendResendEmail({
      apiKey: "re_test",
      from: "noreply@3xper.com",
      to: "sachin@andreihealth.com",
      subject: "Sign in to 3xper",
      html: "<p>link</p>",
      text: "link",
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

  it("does not retry a 403 when already using the default from", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "sandbox only",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendResendEmail({
        apiKey: "re_test",
        from: DEFAULT_RESEND_FROM,
        to: "sachin@andreihealth.com",
        subject: "Sign in",
        html: "<p>link</p>",
      })
    ).rejects.toThrow(/Resend API error: 403/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
