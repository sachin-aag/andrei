import { describe, expect, it } from "vitest";
import { validateCsv } from "@/lib/attachments/validate-csv";

describe("validateCsv", () => {
  it("accepts a small CSV and reports a sentinel page count", () => {
    expect(validateCsv(Buffer.from("batch,result\nB-1,pass\n"))).toEqual({
      pageCount: 1,
    });
  });

  it("rejects empty or binary files", () => {
    expect(() => validateCsv(Buffer.from(""))).toThrow(/not a valid CSV/i);
    expect(() => validateCsv(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toThrow(
      /not a valid CSV/i
    );
  });
});
