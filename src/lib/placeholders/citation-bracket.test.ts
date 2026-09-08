import { describe, expect, it } from "vitest";
import {
  isCitationShapedBracket,
  isNumericCitationMarker,
  isSourceCitationBracket,
  parseSourceCitation,
  repairedCitationBracket,
  sourceCitationLinkSpans,
  splitSourceCitationParts,
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
    expect(
      isCitationShapedBracket(
        "[790-00134R_Rev_U_Solea_Model_3_Software_Design_Verification_Test_Report_(Report_Only).docx, p. 1]"
      )
    ).toBe(true);
    expect(
      isCitationShapedBracket(
        "[790-00134R_Rev_U_Solea_Model_3_Software_Design_Verification_Test_Report_(Report_Only)]"
      )
    ).toBe(true);
    expect(
      isCitationShapedBracket(
        "[790-00134RRevUSoleaModel3SoftwareDesignVerificationTestReport(ReportOnly).docx]"
      )
    ).toBe(true);
    expect(
      isCitationShapedBracket(
        "[790-00134R_Rev_U_Solea_Model_3_Software_: <to be filled>]"
      )
    ).toBe(true);
    expect(
      isCitationShapedBracket("[recipe.docx, p. 3, 4]")
    ).toBe(true);
  });

  it("recognizes CUID2 attachment ids the model copied from the document index", () => {
    expect(isCitationShapedBracket("[me1q4zzhb1me0wwskpmqfw7i]")).toBe(true);
    expect(isCitationShapedBracket("[nzvuqnlquzaqwqyv3n8h0k2u, p. 1]")).toBe(
      true
    );
    expect(
      isCitationShapedBracket("[me1q4zzhb1me0wwskpmqfw7i: <to be filled>]")
    ).toBe(true);
    expect(
      isCitationShapedBracket("[me1q4zzhb1me0wwskpmqfw7i,: <to be filled>]")
    ).toBe(true);
    expect(
      isCitationShapedBracket("[swja2t3b3dif1ua8id1zkyz2,: <to be filled>]")
    ).toBe(true);
    expect(isSourceCitationBracket("[me1q4zzhb1me0wwskpmqfw7i]")).toBe(true);
  });

  it("recognizes MJ QMS document identifiers", () => {
    expect(isCitationShapedBracket("[PRQR-25-PR-005]")).toBe(true);
    expect(
      isCitationShapedBracket("[PRQR-25-PR-005: <to be filled>]")
    ).toBe(true);
    expect(isCitationShapedBracket("[SOP/DP/QA/008]")).toBe(true);
    expect(isCitationShapedBracket("[ELR/DP/PR/26/001]")).toBe(true);
    expect(isCitationShapedBracket("[E/PR/070]")).toBe(true);
    expect(isSourceCitationBracket("[PRQR-25-PR-005]")).toBe(true);
    expect(isCitationShapedBracket("[Batch number: B-2024-117]")).toBe(false);
    expect(isCitationShapedBracket("[B-2024-117]")).toBe(false);
    expect(isCitationShapedBracket("[DEV-001]")).toBe(false);
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
    expect(
      repairedCitationBracket(
        "[790-00134R_Rev_U_Solea_Model_3_Software_: <to be filled>]"
      )
    ).toBe("[790-00134R_Rev_U_Solea_Model_3_Software_]");
    expect(repairedCitationBracket("[Appendix B: <to be filled>]")).toBe(
      "[Appendix B]"
    );
    expect(
      repairedCitationBracket("[me1q4zzhb1me0wwskpmqfw7i: <to be filled>]")
    ).toBe("[me1q4zzhb1me0wwskpmqfw7i]");
    expect(
      repairedCitationBracket("[me1q4zzhb1me0wwskpmqfw7i,: <to be filled>]")
    ).toBe("[me1q4zzhb1me0wwskpmqfw7i]");
    expect(
      repairedCitationBracket("[PRQR-25-PR-005: <to be filled>]")
    ).toBe("[PRQR-25-PR-005]");
    expect(
      repairedCitationBracket("[SOP/DP/QA/008: <to be filled>]")
    ).toBe("[SOP/DP/QA/008]");
  });

  it("returns null for real placeholders and bare citations", () => {
    expect(repairedCitationBracket("[SOP No.: <to be filled>]")).toBeNull();
    expect(repairedCitationBracket("[batch-coa.pdf]")).toBeNull();
    expect(repairedCitationBracket("[Attachment_XIV]")).toBeNull();
    expect(repairedCitationBracket("[12]")).toBeNull();
  });
});

describe("parseSourceCitation", () => {
  it("parses filename and a single page", () => {
    expect(parseSourceCitation("[protocol.pdf, p. 3]")).toEqual({
      filename: "protocol.pdf",
      pages: [3],
    });
  });

  it("parses several pages and uses the first as the jump list", () => {
    expect(
      parseSourceCitation(
        "[825-00101(RevA) Model 3 Perioguide DV Report.pdf, p. 4, 26, 163, 260]"
      )
    ).toEqual({
      filename: "825-00101(RevA) Model 3 Perioguide DV Report.pdf",
      pages: [4, 26, 163, 260],
    });
  });

  it("omits pages when the cite has no page suffix", () => {
    expect(parseSourceCitation("[protocol.pdf]")).toEqual({
      filename: "protocol.pdf",
      pages: [],
    });
  });

  it("returns null for numeric markers and placeholders", () => {
    expect(parseSourceCitation("[3]")).toBeNull();
    expect(parseSourceCitation("[batch number]")).toBeNull();
  });

  it("uses the first file when two sources share one bracket", () => {
    expect(
      parseSourceCitation(
        "[RTM for E-PR-068,.pdf, p. 100, CSV-RTM-PR-053.pdf, p. 5]"
      )
    ).toEqual({
      filename: "RTM for E-PR-068,.pdf",
      pages: [100],
    });
  });
});

describe("splitSourceCitationParts", () => {
  it("splits two files with pages in one bracket", () => {
    expect(
      splitSourceCitationParts(
        "RTM for E-PR-068,.pdf, p. 100, CSV-RTM-PR-053.pdf, p. 5"
      )
    ).toEqual(["RTM for E-PR-068,.pdf, p. 100", "CSV-RTM-PR-053.pdf, p. 5"]);
  });

  it("keeps extra pages of the same file together", () => {
    expect(
      splitSourceCitationParts(
        "825-00101(RevA) Model 3 Perioguide DV Report.pdf, p. 4, 26, 163, 260"
      )
    ).toEqual([
      "825-00101(RevA) Model 3 Perioguide DV Report.pdf, p. 4, 26, 163, 260",
    ]);
  });

  it("splits two filenames without pages", () => {
    expect(splitSourceCitationParts("fileA.pdf, fileB.pdf")).toEqual([
      "fileA.pdf",
      "fileB.pdf",
    ]);
  });

  it("splits attachment-label lists", () => {
    expect(
      splitSourceCitationParts("Attachment_XIV, Attachment_VIII")
    ).toEqual(["Attachment_XIV", "Attachment_VIII"]);
  });
});

describe("sourceCitationLinkSpans", () => {
  it("keeps a single file as one whole-bracket link", () => {
    expect(sourceCitationLinkSpans("[protocol.pdf, p. 3]")).toEqual([
      { from: 0, to: "[protocol.pdf, p. 3]".length, openRaw: "[protocol.pdf, p. 3]" },
    ]);
  });

  it("makes two inner links for a combined cite", () => {
    const match =
      "[RTM for E-PR-068,.pdf, p. 100, CSV-RTM-PR-053.pdf, p. 5]";
    const spans = sourceCitationLinkSpans(match);
    expect(spans).toHaveLength(2);
    expect(spans[0]?.openRaw).toBe("[RTM for E-PR-068,.pdf, p. 100]");
    expect(spans[1]?.openRaw).toBe("[CSV-RTM-PR-053.pdf, p. 5]");
    expect(match.slice(spans[0]!.from, spans[0]!.to)).toBe(
      "RTM for E-PR-068,.pdf, p. 100"
    );
    expect(match.slice(spans[1]!.from, spans[1]!.to)).toBe(
      "CSV-RTM-PR-053.pdf, p. 5"
    );
  });
});
