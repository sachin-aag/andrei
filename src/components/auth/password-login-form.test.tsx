// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
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

describe("PasswordLoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ allowed: true, hasPassword: true }),
      })
    );
  });

  it("renders the email step", () => {
    render(<PasswordLoginForm />);
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("shows unknown email error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      json: async () => ({ allowed: false, hasPassword: false }),
    } as Response);

    const user = userEvent.setup();
    render(<PasswordLoginForm />);
    await user.type(screen.getByLabelText(/work email/i), "nobody@mjbiopharm.com");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(
      await screen.findByText(/this email isn't registered/i)
    ).toBeInTheDocument();
  });

  it("advances to the password step", async () => {
    const user = userEvent.setup();
    render(<PasswordLoginForm />);
    await user.type(screen.getByLabelText(/work email/i), "e2e.password@mjbiopharm.com");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it("shows invalid password error", async () => {
    vi.mocked(signIn).mockResolvedValueOnce({ error: "CredentialsSignin" } as never);

    const user = userEvent.setup();
    render(<PasswordLoginForm />);
    await user.type(screen.getByLabelText(/work email/i), "e2e.password@mjbiopharm.com");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.type(await screen.findByLabelText(/^password$/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/invalid password/i)).toBeInTheDocument();
  });

  it("shows setup password link for accounts without a password", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      json: async () => ({ allowed: true, hasPassword: false }),
    } as Response);

    const user = userEvent.setup();
    render(<PasswordLoginForm />);
    await user.type(screen.getByLabelText(/work email/i), "e2e.nopassword@mjbiopharm.com");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(
      await screen.findByRole("link", { name: /set up a password/i })
    ).toBeInTheDocument();
  });

  it("links to forgot password from the password step", async () => {
    const user = userEvent.setup();
    render(<PasswordLoginForm />);
    await user.type(screen.getByLabelText(/work email/i), "e2e.password@mjbiopharm.com");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByRole("link", { name: /forgot password/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/forgot-password")
    );
  });
});
