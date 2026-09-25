// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ImgHTMLAttributes, ReactNode } from "react";

vi.mock("next/image", () => ({
  default: function MockImage({
    src,
    alt,
    width,
    height,
    className,
  }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} width={width} height={height} className={className} />
    );
  },
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

import { NotFoundView } from "./not-found-view";

function setCustomer(id: "demo" | "mj" | "convergent" | "3xper") {
  vi.stubEnv("ANDREI_CUSTOMER", id);
  vi.stubEnv("NEXT_PUBLIC_ANDREI_CUSTOMER", id);
  vi.stubEnv("ANDREI_VERCEL_DEPLOY_SCOPE", id);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("NotFoundView", () => {
  it("sends a signed-in engineer home and to the vault", () => {
    setCustomer("demo");
    render(<NotFoundView signedIn />);

    expect(
      screen.getByRole("heading", { name: /this page isn’t here/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/doesn’t match a page in Andrei/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to reports/i })).toHaveAttribute(
      "href",
      "/"
    );
    expect(screen.getByRole("link", { name: /document vault/i })).toHaveAttribute(
      "href",
      "/vault"
    );
    expect(screen.queryByRole("link", { name: /^sign in$/i })).not.toBeInTheDocument();
  });

  it("offers sign-in when there is no session", () => {
    setCustomer("demo");
    render(<NotFoundView signedIn={false} />);

    expect(screen.getByRole("link", { name: /^sign in$/i })).toHaveAttribute(
      "href",
      "/login"
    );
    expect(
      screen.queryByRole("link", { name: /back to reports/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /document vault/i })
    ).not.toBeInTheDocument();
  });

  it("names the customer pack in the explanation", () => {
    setCustomer("mj");
    render(<NotFoundView signedIn />);

    expect(
      screen.getByText(/doesn’t match a page in M\.J\. Biopharm/i)
    ).toBeInTheDocument();
  });
});
