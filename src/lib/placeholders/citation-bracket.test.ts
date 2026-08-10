import { describe, expect, it } from "vitest";
import {
  isCitationShapedBracket,
  repairedCitationBracket,
} from "@/lib/placeholders/citation-bracket";

describe("isCitationShapedBracket", () => {
  it("recognizes numeric, page, and attachment-filename citations", () => {
    expect(isCitationShapedBracket("[12]")).toBe(true);
    expect(isCitationShapedBracket("[batch-coa.pdf, p. 3]")).toBe(true);
    expect(isCitationShapedBracket("[Attachment I, p. 2]")).toBe(true);
    expect(isCitationShapedBracket("[DV Requriements Convergent Dental.pdf]")).toBe(
      true
    );
    expect(isCitationShapedBracket("[protocol.docx]")).toBe(true);
  });

  it("recognizes citations wrongly wrapped as placeholders", () => {
    expect(
      isCitationShapedBracket(
        "[DV Requriements Convergent Dental.pdf: <to be filled>]"
      )
    ).toBe(true);
    expect(
      isCitationShapedBracket("[batch-coa.pdf, p. 3: <to be filled>]")
    ).toBe(true);
  });

  it("rejects ordinary placeholders and guidance", () => {
    expect(isCitationShapedBracket("[batch number]")).toBe(false);
    expect(isCitationShapedBracket("[SOP No.: <to be filled>]")).toBe(false);
    expect(
      isCitationShapedBracket(
        "[Detailed narrative of the observation, including environmental conditions]"
      )
    ).toBe(false);
  });
});

describe("repairedCitationBracket", () => {
  it("strips mistaken to-be-filled wrappers from citations", () => {
    expect(
      repairedCitationBracket(
        "[DV Requriements Convergent Dental.pdf: <to be filled>]"
      )
    ).toBe("[DV Requriements Convergent Dental.pdf]");
    expect(
      repairedCitationBracket("[batch-coa.pdf, p. 3: <to be filled>]")
    ).toBe("[batch-coa.pdf, p. 3]");
  });

  it("returns null for real placeholders and bare citations", () => {
    expect(repairedCitationBracket("[SOP No.: <to be filled>]")).toBeNull();
    expect(repairedCitationBracket("[batch-coa.pdf]")).toBeNull();
    expect(repairedCitationBracket("[12]")).toBeNull();
  });
});
