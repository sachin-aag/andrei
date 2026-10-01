import { describe, expect, it } from "vitest";
import { textHasSourceCitation } from "@/lib/citations/cell-has-source";

describe("textHasSourceCitation", () => {
  it("accepts filename, page, and parked numeric markers", () => {
    expect(textHasSourceCitation("MF-24-001 [PQR-24-PR-102.pdf, p. 8]")).toBe(
      true
    );
    expect(textHasSourceCitation("Pass [PQR-24-PR-102.pdf]")).toBe(true);
    expect(textHasSourceCitation("Pass [1]")).toBe(true);
  });

  it("rejects empty cells and non-citation brackets", () => {
    expect(textHasSourceCitation("")).toBe(false);
    expect(textHasSourceCitation("MF-25-VIAL-01")).toBe(false);
    expect(textHasSourceCitation("see [TBD]")).toBe(false);
  });
});
