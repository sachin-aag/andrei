// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordLoginForm } from "@/components/auth/password-login-form";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { signIn } from "next-auth/react";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("PasswordLoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ allowed: true, hasPassword: true }))
    );
  });

  it("renders the email step", () => {
    render(<PasswordLoginForm />);
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /email me a sign-in link instead/i })
    ).toBeDisabled();
  });

  it("shows unknown email error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ allowed: false, hasPassword: false })
    );

    const user = userEvent.setup();
    render(<PasswordLoginForm />);
    await user.type(
      screen.getByLabelText(/work email/i),
      "nobody@mjbiopharm.com"
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(
      await screen.findByText(/this email isn't registered/i)
    ).toBeInTheDocument();
  });

  it("shows a readable error when email check fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        { error: "Could not check this email. Please try again." },
        { status: 500 }
      )
    );

    const user = userEvent.setup();
    render(<PasswordLoginForm />);
    await user.type(screen.getByLabelText(/work email/i), "user@mjbiopharm.com");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(
      await screen.findByText(/could not check this email/i)
    ).toBeInTheDocument();
  });

  it("advances to the password step", async () => {
    const user = userEvent.setup();
    render(<PasswordLoginForm />);
    await user.type(
      screen.getByLabelText(/work email/i),
      "e2e.password@mjbiopharm.com"
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it("moves locked accounts to the password step with reset link", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ allowed: true, hasPassword: true, locked: true })
    );

    const user = userEvent.setup();
    render(<PasswordLoginForm />);
    await user.type(
      screen.getByLabelText(/work email/i),
      "locked@mjbiopharm.com"
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(
      await screen.findByText(/this account is locked after too many failed/i)
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeDisabled();
    expect(
      screen.getByRole("link", { name: /forgot password/i })
    ).toHaveAttribute(
      "href",
      expect.stringContaining("/forgot-password?email=locked%40mjbiopharm.com")
    );
  });

  it("shows invalid password error", async () => {
    vi.mocked(signIn).mockResolvedValueOnce({ error: "CredentialsSignin" } as never);
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ allowed: true, hasPassword: true, locked: false })
    );

    const user = userEvent.setup();
    render(<PasswordLoginForm />);
    await user.type(
      screen.getByLabelText(/work email/i),
      "e2e.password@mjbiopharm.com"
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    const passwordInput = await screen.findByLabelText(/^password$/i);
    await waitFor(() => expect(passwordInput).not.toBeDisabled());
    await user.type(passwordInput, "wrong");

    const signInButton = screen.getByRole("button", { name: /sign in/i });
    await waitFor(() => expect(signInButton).not.toBeDisabled());
    await user.click(signInButton);

    expect(await screen.findByText(/invalid password/i)).toBeInTheDocument();
  });

  it("shows setup password link for accounts without a password", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ allowed: true, hasPassword: false })
    );

    const user = userEvent.setup();
    render(<PasswordLoginForm />);
    await user.type(
      screen.getByLabelText(/work email/i),
      "e2e.nopassword@mjbiopharm.com"
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(
      await screen.findByRole("link", { name: /set up a password/i })
    ).toBeInTheDocument();
  });

  it("links to forgot password from the password step", async () => {
    const user = userEvent.setup();
    render(<PasswordLoginForm />);
    await user.type(
      screen.getByLabelText(/work email/i),
      "e2e.password@mjbiopharm.com"
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(
      await screen.findByRole("link", { name: /forgot password/i })
    ).toHaveAttribute("href", expect.stringContaining("/forgot-password"));
  });

  it("sends a magic link from the email step without asking for a password", async () => {
    vi.mocked(signIn).mockResolvedValueOnce({ ok: true } as never);

    const user = userEvent.setup();
    render(<PasswordLoginForm redirectTo="/reports" />);
    await user.type(
      screen.getByLabelText(/work email/i),
      "e2e.password@mjbiopharm.com"
    );
    await user.click(
      screen.getByRole("button", { name: /email me a sign-in link instead/i })
    );

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(signIn).toHaveBeenCalledWith("resend", {
      email: "e2e.password@mjbiopharm.com",
      redirectTo: "/reports",
      redirect: false,
    });
    expect(
      screen.getByText("e2e.password@mjbiopharm.com")
    ).toBeInTheDocument();
  });

  it("sends a magic link from the password step", async () => {
    vi.mocked(signIn).mockResolvedValueOnce({ ok: true } as never);

    const user = userEvent.setup();
    render(<PasswordLoginForm />);
    await user.type(
      screen.getByLabelText(/work email/i),
      "e2e.password@mjbiopharm.com"
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    const magicLinkButton = await screen.findByRole("button", {
      name: /^email me a sign-in link$/i,
    });
    await user.click(magicLinkButton);

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(signIn).toHaveBeenCalledWith("resend", {
      email: "e2e.password@mjbiopharm.com",
      redirectTo: "/",
      redirect: false,
    });
  });

  it("still offers a magic link when the password account is locked", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ allowed: true, hasPassword: true, locked: true })
    );
    vi.mocked(signIn).mockResolvedValueOnce({ ok: true } as never);

    const user = userEvent.setup();
    render(<PasswordLoginForm />);
    await user.type(
      screen.getByLabelText(/work email/i),
      "locked@mjbiopharm.com"
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    const magicLinkButton = await screen.findByRole("button", {
      name: /^email me a sign-in link$/i,
    });
    await user.click(magicLinkButton);

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
  });

  it("offers a magic link for accounts without a password", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ allowed: true, hasPassword: false })
    );
    vi.mocked(signIn).mockResolvedValueOnce({ ok: true } as never);

    const user = userEvent.setup();
    render(<PasswordLoginForm />);
    await user.type(
      screen.getByLabelText(/work email/i),
      "e2e.nopassword@mjbiopharm.com"
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(
      await screen.findByRole("link", { name: /set up a password/i })
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /^email me a sign-in link$/i })
    );

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
  });

  it("shows an error when sending a magic link fails", async () => {
    vi.mocked(signIn).mockResolvedValueOnce({ error: "EmailSignin" } as never);

    const user = userEvent.setup();
    render(<PasswordLoginForm />);
    await user.type(
      screen.getByLabelText(/work email/i),
      "e2e.password@mjbiopharm.com"
    );
    await user.click(
      screen.getByRole("button", { name: /email me a sign-in link instead/i })
    );

    expect(
      await screen.findByText(/could not send a sign-in link/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
  });

  it("rejects unknown emails on the magic-link path", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ allowed: false, hasPassword: false })
    );

    const user = userEvent.setup();
    render(<PasswordLoginForm />);
    await user.type(
      screen.getByLabelText(/work email/i),
      "nobody@mjbiopharm.com"
    );
    await user.click(
      screen.getByRole("button", { name: /email me a sign-in link instead/i })
    );

    expect(
      await screen.findByText(/this email isn't registered/i)
    ).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });
});
