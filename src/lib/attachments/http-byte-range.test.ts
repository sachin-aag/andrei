import { describe, expect, it } from "vitest";
import {
  contentRangeHeader,
  parseByteRangeHeader,
  rangeContentLength,
} from "@/lib/attachments/http-byte-range";

describe("parseByteRangeHeader", () => {
  it("serves the full object when Range is missing or the size is unknown", () => {
    expect(parseByteRangeHeader(null, 1000)).toEqual({ kind: "full" });
    expect(parseByteRangeHeader("bytes=0-10", 0)).toEqual({ kind: "full" });
    expect(parseByteRangeHeader("bytes=0-10", -1)).toEqual({ kind: "full" });
  });

  it("parses inclusive and open-ended ranges", () => {
    expect(parseByteRangeHeader("bytes=0-499", 1000)).toEqual({
      kind: "partial",
      start: 0,
      end: 499,
    });
    expect(parseByteRangeHeader("bytes=500-", 1000)).toEqual({
      kind: "partial",
      start: 500,
      end: 999,
    });
    expect(parseByteRangeHeader("bytes=900-9999", 1000)).toEqual({
      kind: "partial",
      start: 900,
      end: 999,
    });
  });

  it("parses suffix ranges that pdf.js uses for the xref table", () => {
    expect(parseByteRangeHeader("bytes=-200", 1000)).toEqual({
      kind: "partial",
      start: 800,
      end: 999,
    });
    expect(parseByteRangeHeader("bytes=-5000", 1000)).toEqual({
      kind: "partial",
      start: 0,
      end: 999,
    });
  });

  it("treats malformed Range as a full-body request", () => {
    expect(parseByteRangeHeader("items=0-10", 1000)).toEqual({ kind: "full" });
    expect(parseByteRangeHeader("bytes=0-10,20-30", 1000)).toEqual({
      kind: "full",
    });
    expect(parseByteRangeHeader("bytes=-", 1000)).toEqual({ kind: "full" });
  });

  it("rejects unsatisfiable ranges", () => {
    expect(parseByteRangeHeader("bytes=1000-1001", 1000)).toEqual({
      kind: "unsatisfiable",
    });
    expect(parseByteRangeHeader("bytes=20-10", 1000)).toEqual({
      kind: "unsatisfiable",
    });
    expect(parseByteRangeHeader("bytes=-0", 1000)).toEqual({
      kind: "unsatisfiable",
    });
  });
});

describe("range helpers", () => {
  it("formats Content-Range and the selected length", () => {
    expect(contentRangeHeader({ start: 0, end: 499 }, 1000)).toBe(
      "bytes 0-499/1000"
    );
    expect(rangeContentLength({ start: 0, end: 499 })).toBe(500);
  });
});
