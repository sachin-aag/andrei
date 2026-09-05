import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {},
}));

import { normalizeFolderName } from "@/lib/attachments/library-folders";

describe("library-folders", () => {
  it("normalizes folder names using shared rules", () => {
    expect(normalizeFolderName("  Lab data  ")).toBe("Lab data");
    expect(normalizeFolderName("bad/name")).toBeNull();
  });
});
