import { describe, expect, it } from "vitest";
import { isLocalDatabaseUrl, normalizeDatabaseUrl } from "./connection";

describe("normalizeDatabaseUrl", () => {
  it("rewrites legacy sslmode values to verify-full", () => {
    expect(
      normalizeDatabaseUrl(
        "postgresql://user:pass@ep-x.neon.tech/db?sslmode=require"
      )
    ).toBe("postgresql://user:pass@ep-x.neon.tech/db?sslmode=verify-full");

    expect(
      normalizeDatabaseUrl(
        "postgres://user:pass@ep-x.neon.tech/db?sslmode=prefer&channel_binding=require"
      )
    ).toBe(
      "postgres://user:pass@ep-x.neon.tech/db?sslmode=verify-full&channel_binding=require"
    );

    expect(
      normalizeDatabaseUrl(
        "postgresql://user:pass@ep-x.neon.tech/db?sslmode=verify-ca"
      )
    ).toContain("sslmode=verify-full");
  });

  it("leaves verify-full and local URLs unchanged", () => {
    const secure =
      "postgresql://user:pass@ep-x.neon.tech/db?sslmode=verify-full";
    expect(normalizeDatabaseUrl(secure)).toBe(secure);

    const local = "postgresql://andrei:andrei@127.0.0.1:5432/andrei_dev";
    expect(normalizeDatabaseUrl(local)).toBe(local);
  });
});

describe("isLocalDatabaseUrl", () => {
  it("detects localhost hosts", () => {
    expect(
      isLocalDatabaseUrl("postgresql://andrei:andrei@127.0.0.1:5432/andrei_dev")
    ).toBe(true);
    expect(
      isLocalDatabaseUrl("postgresql://andrei:andrei@localhost:5432/andrei_dev")
    ).toBe(true);
    expect(
      isLocalDatabaseUrl("postgresql://user:pass@ep-x.neon.tech/db?sslmode=require")
    ).toBe(false);
  });
});
