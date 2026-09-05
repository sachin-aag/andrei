import { describe, expect, it } from "vitest";
import { formatLibraryUploadedAt } from "./library-display";

describe("formatLibraryUploadedAt", () => {
  it("formats ISO timestamps for list display", () => {
    expect(formatLibraryUploadedAt("2026-01-15T14:30:00.000Z")).toMatch(
      /\d{2}\/\d{2}\/2026/
    );
  });
});
