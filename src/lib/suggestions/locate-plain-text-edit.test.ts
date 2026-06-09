import { describe, expect, it } from "vitest";
import {
  applyPlainTextEdit,
  locatePlainTextDeleteSpan,
} from "./locate-plain-text-edit";

describe("locatePlainTextDeleteSpan", () => {
  it("prefers anchor-scoped delete so leading words like hence are included", () => {
    const value =
      "wavelength accuracy standard solution, hence by considering the isolated instance preventive action not anticipated for the occurred nonconformance, however to avoid the reoccurrence, tail";
    const anchor =
      "standard solution, hence by considering the isolated instance preventive action not anticipated for the occurred nonconformance, however to avoid the reoccurrence,";
    const deleteText =
      "hence by considering the isolated instance preventive action not anticipated for the occurred nonconformance, however to avoid the reoccurrence,";

    const span = locatePlainTextDeleteSpan(value, { anchorText: anchor, deleteText });
    expect(span).not.toBeNull();
    expect(value.slice(span!.start, span!.end)).toBe(
      "hence by considering the isolated instance preventive action not anticipated for the occurred nonconformance, however to avoid the reoccurrence,"
    );
  });

  it("uses anchor scope when delete text is ambiguous in the full field", () => {
    const value =
      "hence by considering alpha. Later hence by considering beta.";
    const anchor = "hence by considering alpha.";
    const deleteText = "hence by considering alpha";

    expect(
      locatePlainTextDeleteSpan(value, { anchorText: anchor, deleteText })
    ).toEqual({ start: 0, end: "hence by considering alpha".length });
  });
});

describe("applyPlainTextEdit", () => {
  it("inserts after anchor with word boundary spacing", () => {
    const value =
      "system is working as per its intended use therefore, the following";
    const next = applyPlainTextEdit(value, {
      anchorText: "use",
      deleteText: "",
      insertText: "regarding the root cause",
    });
    expect(next).toBe(
      "system is working as per its intended use regarding the root cause therefore, the following"
    );
  });
});
