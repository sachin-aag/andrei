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
  it("tells preview to enable per-git-branch Neon inject", () => {
    const message = missingPreviewDatabaseUrlMessage({
      branch: "cursor/example",
    });
    expect(message).toContain("Branch: cursor/example");
    expect(message).toMatch(
      /Enable "Create a branch for each preview deployment"/
    );
    expect(message).not.toMatch(/shared Preview DATABASE_URL/i);
  });
});

describe("postgresPasswordAuthFailedMessage", () => {
  it("names the host and the Neon preview branch to delete", () => {
    const message = postgresPasswordAuthFailedMessage({
      host: "ep-divine-mountain-am0suhbz-pooler.c-5.us-east-1.aws.neon.tech",
      vercelEnv: "preview",
      deployScope: "mj",
      gitBranch: "cursor/llm-assistant-error-visibility-e3fc",
    });
    expect(message).toContain("28P01");
    expect(message).toContain("ANDREI_VERCEL_DEPLOY_SCOPE=mj");
    expect(message).toContain(
      "ep-divine-mountain-am0suhbz-pooler.c-5.us-east-1.aws.neon.tech"
    );
    expect(message).toContain(
      "Git branch: cursor/llm-assistant-error-visibility-e3fc"
    );
    expect(message).toContain(
      "preview/cursor/llm-assistant-error-visibility-e3fc"
    );
    expect(message).toMatch(/Keep "Create a branch for each preview deployment" ON/);
    expect(message).toMatch(/Do not hand-edit Neon-logo/);
    expect(message).not.toMatch(/turn OFF/i);
    expect(message).not.toMatch(/shared pooled URL/i);
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
