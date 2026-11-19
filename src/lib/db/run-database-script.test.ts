import { afterEach, describe, expect, it } from "vitest";
import { resolveMigrationDatabaseUrlFromEnv } from "@/lib/db/run-database-script";

const KEYS = ["DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const;

describe("resolveMigrationDatabaseUrlFromEnv", () => {
  const previous: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });

  function snapshot(): void {
    for (const key of KEYS) {
      previous[key] = process.env[key];
      delete process.env[key];
    }
  }

  it("prefers the direct unpooled URL for migrations", () => {
    snapshot();
    process.env.DATABASE_URL = "postgresql://user:pass@ep-x-pooler.neon.tech/db";
    process.env.DATABASE_URL_UNPOOLED =
      "postgresql://user:pass@ep-x.neon.tech/db";
    expect(resolveMigrationDatabaseUrlFromEnv()).toBe(
      "postgresql://user:pass@ep-x.neon.tech/db"
    );
  });

  it("falls back to DATABASE_URL when unpooled is unset", () => {
    snapshot();
    process.env.DATABASE_URL = "postgresql://user:pass@ep-x-pooler.neon.tech/db";
    expect(resolveMigrationDatabaseUrlFromEnv()).toBe(
      "postgresql://user:pass@ep-x-pooler.neon.tech/db"
    );
  });
});
