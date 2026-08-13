import { afterEach, describe, expect, it } from "vitest";
import { resolveCustomerId } from "./resolve";

describe("resolveCustomerId", () => {
  afterEach(() => {
    delete process.env.ANDREI_CUSTOMER;
    delete process.env.NEXT_PUBLIC_ANDREI_CUSTOMER;
    delete process.env.ANDREI_VERCEL_DEPLOY_SCOPE;
  });

  it("defaults to demo when no customer env is set", () => {
    expect(resolveCustomerId({})).toBe("demo");
  });

  it("prefers NEXT_PUBLIC_ANDREI_CUSTOMER over ANDREI_CUSTOMER", () => {
    expect(
      resolveCustomerId({
        NEXT_PUBLIC_ANDREI_CUSTOMER: "mj",
        ANDREI_CUSTOMER: "mj",
      })
    ).toBe("mj");
  });

  it("falls back to ANDREI_VERCEL_DEPLOY_SCOPE", () => {
    expect(resolveCustomerId({ ANDREI_VERCEL_DEPLOY_SCOPE: "mj" })).toBe("mj");
  });

  it("throws when ANDREI_CUSTOMER disagrees with NEXT_PUBLIC_ANDREI_CUSTOMER", () => {
    expect(() =>
      resolveCustomerId({
        ANDREI_CUSTOMER: "mj",
        NEXT_PUBLIC_ANDREI_CUSTOMER: "demo",
      })
    ).toThrow(/disagrees with NEXT_PUBLIC_ANDREI_CUSTOMER/);
  });

  it("throws when ANDREI_CUSTOMER disagrees with ANDREI_VERCEL_DEPLOY_SCOPE", () => {
    expect(() =>
      resolveCustomerId({
        ANDREI_CUSTOMER: "mj",
        ANDREI_VERCEL_DEPLOY_SCOPE: "demo",
      })
    ).toThrow(/disagrees with ANDREI_VERCEL_DEPLOY_SCOPE/);
  });

  it("throws on an unknown customer id", () => {
    expect(() => resolveCustomerId({ ANDREI_CUSTOMER: "convergent" })).toThrow(
      /Invalid customer id/
    );
  });
});
