import { describe, expect, it } from "vitest";
import { normalizeBracketPlaceholdersInPlainText } from "@/lib/placeholders/normalize-bracket-placeholders";

describe("normalizeBracketPlaceholdersInPlainText", () => {
  it("appends : <to be filled> for guidance-only brackets", () => {
    expect(normalizeBracketPlaceholdersInPlainText("in [number] vials")).toBe(
      "in [number: <to be filled>] vials"
    );
    expect(
      normalizeBracketPlaceholdersInPlainText(
        "saw [description of particulate, e.g., fibers] here"
      )
    ).toBe(
      "saw [description of particulate, e.g., fibers: <to be filled>] here"
    );
  });

  it("leaves static acceptance-criteria brackets unchanged", () => {
    const input =
      "criteria [TOC of blank water: Not More Than 100 ppb, %CV: Not More Than 5.0%] apply";
    expect(normalizeBracketPlaceholdersInPlainText(input)).toBe(input);
  });

  it("leaves citations [digits] and existing to-be-filled spans unchanged", () => {
    expect(normalizeBracketPlaceholdersInPlainText("see ref [12]")).toBe("see ref [12]");
    expect(
      normalizeBracketPlaceholdersInPlainText("[SOP No.: <to be filled>]")
    ).toBe("[SOP No.: <to be filled>]");
    expect(normalizeBracketPlaceholdersInPlainText("[to be filled]")).toBe(
      "[to be filled]"
    );
  });
});
