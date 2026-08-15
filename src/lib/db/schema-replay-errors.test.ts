import { describe, expect, it } from "vitest";
import { isIgnorableSchemaReplayError } from "@/lib/db/schema-replay-errors";

describe("isIgnorableSchemaReplayError", () => {
  it("ignores CREATE TYPE already exists (42710)", () => {
    expect(
      isIgnorableSchemaReplayError({
        code: "42710",
        message: 'type "attachment_processing_status" already exists',
      })
    ).toBe(true);
  });

  it("ignores duplicate column, table, and function", () => {
    expect(isIgnorableSchemaReplayError({ code: "42701" })).toBe(true);
    expect(isIgnorableSchemaReplayError({ code: "42P07" })).toBe(true);
    expect(isIgnorableSchemaReplayError({ code: "42723" })).toBe(true);
  });

  it("does not ignore missing columns or tables", () => {
    expect(isIgnorableSchemaReplayError({ code: "42703" })).toBe(false);
    expect(isIgnorableSchemaReplayError({ code: "42P01" })).toBe(false);
    expect(isIgnorableSchemaReplayError({ code: "23502" })).toBe(false);
  });

  it("rejects non-pg values", () => {
    expect(isIgnorableSchemaReplayError(null)).toBe(false);
    expect(isIgnorableSchemaReplayError(new Error("type already exists"))).toBe(
      false
    );
    expect(isIgnorableSchemaReplayError({ code: 42710 })).toBe(false);
  });
});
