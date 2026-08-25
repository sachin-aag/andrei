import { describe, expect, it } from "vitest";
import {
  isCitationShapedBracket,
  isNumericCitationMarker,
  isSourceCitationBracket,
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

  it("treats numeric markers as citations but not as source cites", () => {
    expect(isNumericCitationMarker("[3]")).toBe(true);
    expect(isSourceCitationBracket("[3]")).toBe(false);
    expect(isSourceCitationBracket("[protocol.pdf, p. 3]")).toBe(true);
    expect(isSourceCitationBracket("[batch number]")).toBe(false);
  });

  it("recognizes extension-less Attachment exhibit labels and lists", () => {
    expect(isCitationShapedBracket("[Attachment_XIV]")).toBe(true);
    expect(isCitationShapedBracket("[Attachment I]")).toBe(true);
    expect(isCitationShapedBracket("[Attachment-21]")).toBe(true);
    expect(isCitationShapedBracket("[Attachment_XIV, Attachment_VIII]")).toBe(
      true
    );
    expect(isCitationShapedBracket("[Attachment_XIX, Attachment_XXI]")).toBe(
      true
    );
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
    expect(
      isCitationShapedBracket("[Attachment_VIII: <to be filled>]")
    ).toBe(true);
    expect(
      isCitationShapedBracket(
        "[Attachment_IX, Attachment_XI,; <to be filled>]"
      )
    ).toBe(true);
  });

  it("recognizes appendix and document-number citations", () => {
    expect(isCitationShapedBracket("[Appendix B]")).toBe(true);
    expect(isCitationShapedBracket("[Appendix IV]")).toBe(true);
    expect(
      isCitationShapedBracket("[Appendix B DV Report 790-00134R(RevU)]")
    ).toBe(true);
    expect(isCitationShapedBracket("[790-00134R(RevU)]")).toBe(true);
    expect(
      isCitationShapedBracket(
        "[Appendix B DV Report 790-00134R(RevU): <to be filled>]"
      )
    ).toBe(true);
    expect(isCitationShapedBracket("[Appendix B: <to be filled>]")).toBe(true);
  });

  it("rejects ordinary placeholders and guidance", () => {
    expect(isCitationShapedBracket("[batch number]")).toBe(false);
    expect(isCitationShapedBracket("[SOP No.: <to be filled>]")).toBe(false);
    expect(isCitationShapedBracket("[Attachment summary]")).toBe(false);
    expect(isCitationShapedBracket("[Appendix number]")).toBe(false);
    expect(
      isCitationShapedBracket("[Appendix number: <to be filled>]")
    ).toBe(false);
    expect(
      isCitationShapedBracket("[document number: <to be filled>]")
    ).toBe(false);
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
    expect(
      repairedCitationBracket("[Attachment_VIII: <to be filled>]")
    ).toBe("[Attachment_VIII]");
    expect(
      repairedCitationBracket(
        "[Attachment_IX, Attachment_XI,; <to be filled>]"
      )
    ).toBe("[Attachment_IX, Attachment_XI]");
    expect(
      repairedCitationBracket(
        "[Appendix B DV Report 790-00134R(RevU): <to be filled>]"
      )
    ).toBe("[Appendix B DV Report 790-00134R(RevU)]");
    expect(repairedCitationBracket("[Appendix B: <to be filled>]")).toBe(
      "[Appendix B]"
    );
  });

  it("returns null for real placeholders and bare citations", () => {
    expect(repairedCitationBracket("[SOP No.: <to be filled>]")).toBeNull();
    expect(repairedCitationBracket("[batch-coa.pdf]")).toBeNull();
    expect(repairedCitationBracket("[Attachment_XIV]")).toBeNull();
    expect(repairedCitationBracket("[12]")).toBeNull();
  });
});
