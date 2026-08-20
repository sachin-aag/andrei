// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";

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

import { BrandLogo } from "./brand-logo";
import { BrandLockup } from "./brand-lockup";

function setCustomer(id: "demo" | "mj" | "convergent") {
  vi.stubEnv("ANDREI_CUSTOMER", id);
  vi.stubEnv("NEXT_PUBLIC_ANDREI_CUSTOMER", id);
  vi.stubEnv("ANDREI_VERCEL_DEPLOY_SCOPE", id);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("BrandLogo", () => {
  it("renders a wide Convergent wordmark instead of a 28px square", () => {
    setCustomer("convergent");
    render(<BrandLogo />);
    const img = screen.getByRole("img", { name: "Convergent Dental logo" });
    expect(img).toHaveAttribute("src", "/logo-convergent.png");
    expect(img).toHaveAttribute("width", "176");
    expect(img).toHaveAttribute("height", "40");
  });

  it("renders a larger wordmark on the login hero size", () => {
    setCustomer("convergent");
    render(<BrandLogo size="md" />);
    const img = screen.getByRole("img", { name: "Convergent Dental logo" });
    expect(img).toHaveAttribute("width", "281");
    expect(img).toHaveAttribute("height", "64");
  });

  it("uses the circular mark at 48px in collapsed chrome", () => {
    setCustomer("convergent");
    render(<BrandLogo compact />);
    const img = screen.getByRole("img", { name: "Convergent Dental logo" });
    expect(img).toHaveAttribute("src", "/logo-convergent-mark.svg");
    expect(img).toHaveAttribute("width", "48");
    expect(img).toHaveAttribute("height", "48");
  });

  it("keeps demo collapsed chrome at the original 28px icon size", () => {
    setCustomer("demo");
    render(<BrandLogo compact />);
    const img = screen.getByRole("img", { name: "Andrei logo" });
    expect(img).toHaveAttribute("src", "/logo.png");
    expect(img).toHaveAttribute("width", "28");
    expect(img).toHaveAttribute("height", "28");
  });
});

describe("BrandLockup", () => {
  it("does not repeat Convergent Dental next to the wordmark", () => {
    setCustomer("convergent");
    render(<BrandLockup showTagline name="full" />);
    expect(screen.getByRole("img", { name: "Convergent Dental logo" })).toBeInTheDocument();
    expect(screen.queryByText("Convergent Dental")).not.toBeInTheDocument();
    expect(screen.getByText("Solea® Design Verification")).toBeInTheDocument();
  });

  it("still shows the Andrei name beside the square mark", () => {
    setCustomer("demo");
    render(<BrandLockup />);
    expect(screen.getByText("Andrei")).toBeInTheDocument();
    const img = screen.getByRole("img", { name: "Andrei logo" });
    expect(img).toHaveAttribute("width", "32");
  });
});
