// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImgHTMLAttributes, ReactNode } from "react";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("next/link", () => ({
  default: function MockLink({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
  }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

vi.mock("next/image", () => ({
  default: function MockImage({
    src,
    alt,
    width,
    height,
  }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} width={width} height={height} />
    );
  },
}));

vi.mock("@/components/auth/inactivity-logout", () => ({
  InactivityLogout: () => null,
}));

vi.mock("@/providers/user-directory-provider", () => ({
  UserDirectoryProvider: ({ children }: { children: ReactNode }) => children,
}));

import { AppShell } from "./app-shell";

const engineer: WorkspaceUser = {
  id: "u1",
  name: "Test Engineer",
  email: "test.engineer@example.com",
  role: "engineer",
  title: "Engineer",
};

function setCustomer(id: "demo" | "mj" | "convergent") {
  vi.stubEnv("ANDREI_CUSTOMER", id);
  vi.stubEnv("NEXT_PUBLIC_ANDREI_CUSTOMER", id);
  vi.stubEnv("ANDREI_VERCEL_DEPLOY_SCOPE", id);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AppShell brand chrome", () => {
  it("keeps the Convergent circular mark inside the rail when expanded", async () => {
    setCustomer("convergent");
    const user = userEvent.setup();
    render(
      <AppShell user={engineer} initialUsers={[engineer]}>
        <div>main</div>
      </AppShell>
    );

    const collapsedLogo = screen.getByRole("img", {
      name: "Convergent Dental logo",
    });
    expect(collapsedLogo).toHaveAttribute("src", "/logo-convergent-mark.svg");

    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));

    const expandedLogo = screen.getByRole("img", {
      name: "Convergent Dental logo",
    });
    expect(expandedLogo).toHaveAttribute("src", "/logo-convergent-mark.svg");
    expect(expandedLogo).not.toHaveAttribute("src", "/logo-convergent.png");
    expect(screen.getByText("Convergent")).toBeInTheDocument();
    expect(screen.getByText("Design Verification")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Convergent Dental logo" })).toHaveAttribute(
      "width",
      "40"
    );
  });
});
