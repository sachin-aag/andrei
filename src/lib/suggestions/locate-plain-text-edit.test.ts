import { describe, expect, it } from "vitest";
import { applyPlainTextEdit } from "./locate-plain-text-edit";

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
