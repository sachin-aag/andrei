import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyExternalUserLogin, shouldNotifyLogin } from "./notify-login";

describe("shouldNotifyLogin", () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
    vi.unstubAllEnvs();
  });

  it("skips Sachin, Aditya, test login, and missing Resend key", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_RESEND_KEY", "re_test");
    vi.stubEnv("ALLOW_TEST_LOGIN", "false");
    delete process.env.TEST_AUTH_EMAIL;

    expect(
      shouldNotifyLogin({
        name: "Priya",
        email: "priya@mjbiopharm.com",
      })
    ).toBe(true);
    expect(
      shouldNotifyLogin({
        name: "Sachin",
        email: "sachin+admin@andreihealth.com",
      })
    ).toBe(false);
  });
});

describe("notifyExternalUserLogin", () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("emails Sachin and Aditya with the instance name", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_RESEND_KEY", "re_test");
    vi.stubEnv("AUTH_EMAIL_FROM", "noreply@andreihealth.com");
    vi.stubEnv("AUTH_URL", "https://mj.andreihealth.com");
    vi.stubEnv("ANDREI_CUSTOMER", "mj");
    vi.stubEnv("NEXT_PUBLIC_ANDREI_CUSTOMER", "mj");
    vi.stubEnv("ALLOW_TEST_LOGIN", "false");
    delete process.env.TEST_AUTH_EMAIL;
    delete process.env.LOGIN_NOTIFY_DISABLED;
    delete process.env.ANDREI_VERCEL_DEPLOY_SCOPE;
    delete process.env.VERCEL_ENV;

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await notifyExternalUserLogin({
      name: "Priya Engineer",
      email: "priya@mjbiopharm.com",
      role: "engineer",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string
    ) as { to: string[]; subject: string; html: string };
    expect(body.to).toEqual([
      "sachin@andreihealth.com",
      "aditya@andreihealth.com",
    ]);
    expect(body.subject).toContain("[MJ]");
    expect(body.html).toContain("Priya Engineer");
    expect(body.html).toContain("priya@mjbiopharm.com");
  });

  it("does not email when the signer is Aditya", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_RESEND_KEY", "re_test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await notifyExternalUserLogin({
      name: "Aditya",
      email: "aditya@andreihealth.com",
      role: "engineer",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
