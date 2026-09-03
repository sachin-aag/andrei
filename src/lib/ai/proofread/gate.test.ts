import { describe, expect, it } from "vitest";
import { contextAnchor, gateProofreadEdit } from "./gate";

describe("proofread gate", () => {
  it("drops empty or no-op edits", () => {
    expect(
      gateProofreadEdit("i dont know", {
        deleteText: "",
        insertText: "don't",
        anchorText: "",
      }).ok
    ).toBe(false);
    expect(
      gateProofreadEdit("i dont know", {
        deleteText: "dont",
        insertText: "dont",
        anchorText: "",
      }).ok
    ).toBe(false);
  });

  it("adds context around a short unique span", () => {
    const gated = gateProofreadEdit("i dont know what happened", {
      deleteText: "dont",
      insertText: "don't",
      anchorText: "",
    });
    expect(gated.ok).toBe(true);
    if (!gated.ok) return;
    expect(gated.edit.deleteText).toBe("dont");
    expect(gated.edit.insertText).toBe("don't");
    expect(gated.edit.anchorText).toContain("dont");
    expect(gated.edit.anchorText.length).toBeGreaterThan("dont".length);
  });

  it("drops spans that are not in the unit", () => {
    expect(
      gateProofreadEdit("everything is fine here", {
        deleteText: "dont",
        insertText: "don't",
        anchorText: "",
      }).ok
    ).toBe(false);
  });

  it("builds a bounded context window", () => {
    expect(contextAnchor("abcdefghij", 3, 5, 2)).toBe("bcdefg");
  });
});
