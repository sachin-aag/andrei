import { describe, expect, it } from "vitest";
import {
  classifyRecordReference,
  classifyRecordType,
  recordTypeReferenceMismatch,
} from "./record-type";

describe("recordTypeReferenceMismatch", () => {
  it("accepts a CAPA row that cites a CAPA number", () => {
    expect(classifyRecordType("CAPA")).toBe("capa");
    expect(classifyRecordReference("CAPA-26-014")).toBe("capa");
    expect(recordTypeReferenceMismatch("CAPA", "CAPA-26-014")).toBeNull();
  });

  it("flags a deviation type citing a CAPA number", () => {
    expect(recordTypeReferenceMismatch("Dev", "CAPA-26-014")).toEqual({
      typeClass: "deviation",
      refClass: "capa",
    });
  });

  it("skips blank or unclassifiable references", () => {
    expect(recordTypeReferenceMismatch("CAPA", "")).toBeNull();
    expect(recordTypeReferenceMismatch("Note", "MEMO-1")).toBeNull();
  });
});
