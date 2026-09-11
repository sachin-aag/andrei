import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXTERNAL_LOGIN_ALERT_RECIPIENTS,
  emailDomain,
  isAndreiHealthEmail,
  notifyExternalLogin,
} from "./external-login-alert";

describe("isAndreiHealthEmail", () => {
  it("matches the Andrei Health domain case-insensitively, including plus aliases", () => {
    expect(isAndreiHealthEmail("sachin@andreihealth.com")).toBe(true);
    expect(isAndreiHealthEmail("Aditya+Manager@AndreiHealth.com")).toBe(true);
    expect(emailDomain("Aditya+Manager@AndreiHealth.com")).toBe(
      "andreihealth.com"
    );
  });

  it("treats every other domain as external", () => {
    expect(isAndreiHealthEmail("test.engineer@mjbiopharm.com")).toBe(false);
    expect(isAndreiHealthEmail("sam@convergentdental.com")).toBe(false);
    expect(isAndreiHealthEmail("user@andreihealth.com.evil.test")).toBe(false);
    expect(isAndreiHealthEmail("not-an-email")).toBe(false);
    expect(isAndreiHealthEmail(null)).toBe(false);
  });
});

describe("notifyExternalLogin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubResendEnv() {
    vi.stubEnv("AUTH_RESEND_KEY", "re_test");
    vi.stubEnv("AUTH_URL", "https://mj.andreihealth.com");
    vi.stubEnv("AUTH_EMAIL_FROM", "noreply@andreihealth.com");
    vi.stubEnv("ANDREI_CUSTOMER", "mj");
    vi.stubEnv("NEXT_PUBLIC_ANDREI_CUSTOMER", "mj");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ALLOW_TEST_LOGIN", "");
    vi.stubEnv("TEST_AUTH_EMAIL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("VERCEL_BRANCH_URL", "");
    vi.stubEnv("VERCEL_URL", "");
  }

  it("skips Andrei Health addresses without calling Resend", async () => {
    stubResendEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      notifyExternalLogin({
        email: "sachin@andreihealth.com",
        name: "Sachin",
      })
    ).resolves.toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips when AUTH_RESEND_KEY is missing", async () => {
    stubResendEnv();
    vi.stubEnv("AUTH_RESEND_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      notifyExternalLogin({ email: "jane@mjbiopharm.com" })
    ).resolves.toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips Playwright test-login environments", async () => {
    stubResendEnv();
    vi.stubEnv("ALLOW_TEST_LOGIN", "true");
    vi.stubEnv("TEST_AUTH_EMAIL", "test.engineer@mjbiopharm.com");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      notifyExternalLogin({ email: "test.engineer@mjbiopharm.com" })
    ).resolves.toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("emails Sachin and Aditya for an external login", async () => {
    stubResendEnv();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      notifyExternalLogin({
        email: "Jane.Engineer@MJBiopharm.com",
        name: "Jane <script>alert(1)</script>",
      })
    ).resolves.toBe("sent");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string
    ) as { to: string[]; subject: string; html: string; from: string };
    expect(body.from).toBe("noreply@andreihealth.com");
    expect(body.to).toEqual([...EXTERNAL_LOGIN_ALERT_RECIPIENTS]);
    expect(body.subject).toBe(
      "Login from outside Andrei Health — jane.engineer@mjbiopharm.com"
    );
    expect(body.html).toContain("jane.engineer@mjbiopharm.com");
    expect(body.html).toContain("https://mj.andreihealth.com");
    expect(body.html).toContain(">mj</td>");
    expect(body.html).toContain(">production</td>");
    expect(body.html).toContain("&lt;script&gt;");
    expect(body.html).not.toContain("<script>alert(1)</script>");
  });

  it("does not throw when Resend rejects the send", async () => {
    stubResendEnv();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "forbidden",
    });
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      notifyExternalLogin({ email: "sam@convergentdental.com" })
    ).resolves.toBe("skipped");
    expect(errorSpy).toHaveBeenCalled();
  });
});
