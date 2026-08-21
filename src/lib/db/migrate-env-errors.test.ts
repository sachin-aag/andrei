import { describe, expect, it } from "vitest";
import {
  isPostgresPasswordAuthError,
  missingPreviewDatabaseUrlMessage,
  postgresPasswordAuthFailedMessage,
} from "@/lib/db/migrate-env-errors";

describe("isPostgresPasswordAuthError", () => {
  it("matches Postgres 28P01", () => {
    expect(
      isPostgresPasswordAuthError({
        code: "28P01",
        message: "password authentication failed for user 'neondb_owner'",
      })
    ).toBe(true);
  });

  it("matches the password-failed message when code is missing", () => {
    expect(
      isPostgresPasswordAuthError(
        new Error("password authentication failed for user 'neondb_owner'")
      )
    ).toBe(true);
  });

  it("rejects other connection errors", () => {
    expect(isPostgresPasswordAuthError({ code: "28P02" })).toBe(false);
    expect(isPostgresPasswordAuthError({ code: "57P01" })).toBe(false);
    expect(isPostgresPasswordAuthError(new Error("connection refused"))).toBe(
      false
    );
    expect(isPostgresPasswordAuthError(null)).toBe(false);
  });
});

describe("missingPreviewDatabaseUrlMessage", () => {
  it("does not tell andrei-v2 to enable preview branching", () => {
    const message = missingPreviewDatabaseUrlMessage({
      branch: "cursor/example",
    });
    expect(message).toContain("Branch: cursor/example");
    expect(message).toMatch(/Do not enable "Create a branch for each preview deployment"/);
    expect(message).not.toMatch(/andrei-v2: enable Neon preview branching/i);
  });
});

describe("postgresPasswordAuthFailedMessage", () => {
  it("names the host and points at the shared Preview URL", () => {
    const message = postgresPasswordAuthFailedMessage({
      host: "ep-divine-mountain-am0suhbz-pooler.c-5.us-east-1.aws.neon.tech",
      vercelEnv: "preview",
      deployScope: "mj",
    });
    expect(message).toContain("28P01");
    expect(message).toContain("ANDREI_VERCEL_DEPLOY_SCOPE=mj");
    expect(message).toContain(
      "ep-divine-mountain-am0suhbz-pooler.c-5.us-east-1.aws.neon.tech"
    );
    expect(message).toMatch(/turn OFF/);
    expect(message).toMatch(/Do not hand-edit Neon-logo/);
    expect(message).not.toMatch(/enable Neon preview branching/i);
  });

  it("labels an unset deploy scope", () => {
    const message = postgresPasswordAuthFailedMessage({
      host: "example.neon.tech",
      vercelEnv: "production",
      deployScope: undefined,
    });
    expect(message).toContain("ANDREI_VERCEL_DEPLOY_SCOPE=unset");
  });
});
