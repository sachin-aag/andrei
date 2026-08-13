import { describe, expect, it, vi } from "vitest";

// Module reaches the DB on import; these cases only exercise pure name parsing.
vi.mock("@/db", () => ({ db: {} }));

import { MAX_FOLDER_NAME_LENGTH, normalizeFolderName } from "./folders";

describe("normalizeFolderName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeFolderName("  Batch   Records ")).toBe("Batch Records");
  });

  it("rejects empty, path-like, and over-long names", () => {
    expect(normalizeFolderName("   ")).toBeNull();
    expect(normalizeFolderName(".")).toBeNull();
    expect(normalizeFolderName("..")).toBeNull();
    expect(normalizeFolderName("a/b")).toBeNull();
    expect(normalizeFolderName("x".repeat(MAX_FOLDER_NAME_LENGTH + 1))).toBeNull();
  });
});
