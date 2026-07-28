import { describe, expect, it } from "vitest";
import { MAX_PLACEHOLDER_LABEL_LENGTH } from "@/lib/placeholders/find";
import { normalizeBracketPlaceholdersInPlainText } from "@/lib/placeholders/normalize-bracket-placeholders";
import { compactPlaceholderLabel } from "@/lib/placeholders/label";

describe("compactPlaceholderLabel", () => {
  it("strips filler prefixes and stays within the shared limit", () => {
    const compacted = compactPlaceholderLabel(
      "Name/ID of Monitoring System or Refrigerator Unit"
    );
    expect(compacted.length).toBeLessThanOrEqual(MAX_PLACEHOLDER_LABEL_LENGTH);
    expect(compacted).toBe("Monitoring System or Refrigerator Unit");
  });

  it("leaves short domain labels unchanged", () => {
    expect(compactPlaceholderLabel("batch number")).toBe("batch number");
    expect(compactPlaceholderLabel("Responsible person")).toBe("Responsible person");
  });
});

describe("normalizeBracketPlaceholdersInPlainText", () => {
  it("appends : <to be filled> for guidance-only brackets", () => {
    expect(normalizeBracketPlaceholdersInPlainText("in [number] vials")).toBe(
      "in [number: <to be filled>] vials"
    );
    expect(
      normalizeBracketPlaceholdersInPlainText(
        "saw [description of particulate, e.g., fibers] here"
      )
    ).toBe("saw [particulate, e.g., fibers: <to be filled>] here");
  });

  it("compacts long AI guidance labels into canonical form under the limit", () => {
    const out = normalizeBracketPlaceholdersInPlainText(
      "system is [Name/ID of Monitoring System or Refrigerator Unit]."
    );
    expect(out).toBe(
      "system is [Monitoring System or Refrigerator Unit: <to be filled>]."
    );
    const label = out.match(/\[(.+?): <to be filled>\]/)?.[1] ?? "";
    expect(label.length).toBeLessThanOrEqual(MAX_PLACEHOLDER_LABEL_LENGTH);
  });

  it("compacts oversized labels that already include to be filled", () => {
    expect(
      normalizeBracketPlaceholdersInPlainText(
        "[Name/ID of Monitoring System or Refrigerator Unit: <to be filled>]"
      )
    ).toBe("[Monitoring System or Refrigerator Unit: <to be filled>]");
  });

  it("truncates labels that remain over the limit after filler stripping", () => {
    const long =
      "equipment identifier for primary cold chain monitoring system refrigerator unit warehouse zone";
    const compacted = compactPlaceholderLabel(long);
    expect(compacted.length).toBeLessThanOrEqual(MAX_PLACEHOLDER_LABEL_LENGTH);
    expect(compacted).not.toBe(long);
    expect(
      normalizeBracketPlaceholdersInPlainText(`[${long}]`)
    ).toBe(`[${compacted}: <to be filled>]`);
  });

  it("leaves static acceptance-criteria brackets unchanged", () => {
    const input =
      "criteria [TOC of blank water: Not More Than 100 ppb, %CV: Not More Than 5.0%] apply";
    expect(normalizeBracketPlaceholdersInPlainText(input)).toBe(input);
  });

  it("leaves citations [digits] and bare to-be-filled spans unchanged", () => {
    expect(normalizeBracketPlaceholdersInPlainText("see ref [12]")).toBe("see ref [12]");
    expect(
      normalizeBracketPlaceholdersInPlainText("[SOP No.: <to be filled>]")
    ).toBe("[SOP No.: <to be filled>]");
    expect(normalizeBracketPlaceholdersInPlainText("[to be filled]")).toBe(
      "[to be filled]"
    );
  });
});
