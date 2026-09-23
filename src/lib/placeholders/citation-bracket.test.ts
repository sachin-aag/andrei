import { describe, expect, it } from "vitest";
import {
  canonicalizeSourceCitationBracket,
  citationNumbersFromMarker,
  formatNumericCitationMarker,
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
    expect(isCitationShapedBracket("[batch-coa.pdf, p. 1-3]")).toBe(true);
    expect(isCitationShapedBracket("[batch-coa.pdf, p. 1–3]")).toBe(true);
  });

  it("treats numeric markers as citations but not as source cites", () => {
    expect(isNumericCitationMarker("[3]")).toBe(true);
    expect(isNumericCitationMarker("[1,2,3]")).toBe(true);
    expect(isNumericCitationMarker("[1, 2]")).toBe(true);
    expect(isSourceCitationBracket("[3]")).toBe(false);
    expect(isSourceCitationBracket("[1,2]")).toBe(false);
    expect(isSourceCitationBracket("[protocol.pdf, p. 3]")).toBe(true);
    expect(isSourceCitationBracket("[batch number]")).toBe(false);
  });

  it("parses and formats combined numeric markers", () => {
    expect(citationNumbersFromMarker("[1,2,3]")).toEqual([1, 2, 3]);
    expect(citationNumbersFromMarker("[1, 2]")).toEqual([1, 2]);
    expect(citationNumbersFromMarker("[3]")).toEqual([3]);
    expect(formatNumericCitationMarker([1, 2, 2, 3])).toBe("[1,2,3]");
    expect(formatNumericCitationMarker([4])).toBe("[4]");
    expect(isCitationShapedBracket("[1,2]")).toBe(true);
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

  it("keeps commas inside the filename and parses a single page", () => {
    expect(
      parseSourceCitation(
        "[URS-FP-21-006 vial washinh, sterilization, filling and sealing machine.pdf, p. 16]"
      )
    ).toEqual({
      filename:
        "URS-FP-21-006 vial washinh, sterilization, filling and sealing machine.pdf",
      pages: [16],
    });
  });

  it("parses repeated p. N page lists as pages of the same file", () => {
    expect(
      parseSourceCitation(
        "[Master PMC-PR-014-R03 Filling and Capping Machine.pdf, p. 1, p. 2]"
      )
    ).toEqual({
      filename: "Master PMC-PR-014-R03 Filling and Capping Machine.pdf",
      pages: [1, 2],
    });
  });

  it("parses a hyphenated title word followed by and in the filename", () => {
    expect(
      parseSourceCitation("[QDF-Filling and capping machine.pdf, p. 2]")
    ).toEqual({
      filename: "QDF-Filling and capping machine.pdf",
      pages: [2],
    });
  });

  it("parses a compact id plus English title words as one filename", () => {
    expect(
      parseSourceCitation(
        "[E-PR-068 and E-PR-071 filling report.pdf, p. 1]"
      )
    ).toEqual({
      filename: "E-PR-068 and E-PR-071 filling report.pdf",
      pages: [1],
    });
  });

  it("parses a compact and-cite as one filename until attachments confirm two files", () => {
    expect(
      parseSourceCitation("[E-PR-068 and E-PR-071.pdf, p. 1]")
    ).toEqual({
      filename: "E-PR-068 and E-PR-071.pdf",
      pages: [1],
    });
    expect(
      parseSourceCitation("[E-PR-068 and E-PR-071.pdf, p. 1]", [
        "E-PR-068.pdf",
        "E-PR-071.pdf",
      ])
    ).toEqual({
      filename: "E-PR-068",
      pages: [],
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

  it("parses a hyphen page range without expanding it", () => {
    expect(parseSourceCitation("[batch-coa.pdf, p. 1-3]")).toEqual({
      filename: "batch-coa.pdf",
      pages: [1, 3],
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

  it("splits two files joined with and", () => {
    expect(
      splitSourceCitationParts("E-PR-068.pdf, p. 1 and E-PR-071.pdf, p. 1")
    ).toEqual(["E-PR-068.pdf, p. 1", "E-PR-071.pdf, p. 1"]);
  });

  it("splits an exhibit stem and a pdf joined with and when both files are known", () => {
    expect(
      splitSourceCitationParts("E-PR-068 and E-PR-071.pdf, p. 1", [
        "E-PR-068.pdf",
        "E-PR-071.pdf",
      ])
    ).toEqual(["E-PR-068", "E-PR-071.pdf, p. 1"]);
  });

  it("does not guess an and-split without attached filenames", () => {
    expect(
      splitSourceCitationParts("E-PR-068 and E-PR-071.pdf, p. 1")
    ).toEqual(["E-PR-068 and E-PR-071.pdf, p. 1"]);
  });

  it("does not peel a compact id when English title words follow and", () => {
    expect(
      splitSourceCitationParts(
        "E-PR-068 and E-PR-071 filling report.pdf, p. 1"
      )
    ).toEqual(["E-PR-068 and E-PR-071 filling report.pdf, p. 1"]);
  });

  it("does not peel a known combined filename that looks like two stems", () => {
    expect(
      splitSourceCitationParts("E-PR-068 and E-PR-071.pdf, p. 1", [
        "E-PR-068 and E-PR-071.pdf",
      ])
    ).toEqual(["E-PR-068 and E-PR-071.pdf, p. 1"]);
  });

  it("does not peel an and-cite when only one side is an attached file", () => {
    expect(
      splitSourceCitationParts("E-PR-068 and E-PR-071.pdf, p. 1", [
        "E-PR-068.pdf",
      ])
    ).toEqual(["E-PR-068 and E-PR-071.pdf, p. 1"]);
  });

  it("does not peel when the LLM name is slightly wrong even if both files are attached", () => {
    expect(
      splitSourceCitationParts("E-PR-068 and E-PR-71.pdf, p. 1", [
        "E-PR-068.pdf",
        "E-PR-071.pdf",
      ])
    ).toEqual(["E-PR-068 and E-PR-71.pdf, p. 1"]);
  });

  it("still splits two-extension and-cites when the names are not attached", () => {
    expect(
      splitSourceCitationParts("E-PR-068-wrong.pdf and E-PR-071-wrong.pdf")
    ).toEqual(["E-PR-068-wrong.pdf", "E-PR-071-wrong.pdf"]);
  });

  it("does not treat English leftover after a pdf as a second source", () => {
    expect(
      splitSourceCitationParts("protocol.pdf and capping machine")
    ).toEqual(["protocol.pdf and capping machine"]);
  });

  it("splits leftover and after a pdf when the remainder is a cite", () => {
    expect(
      splitSourceCitationParts("protocol.pdf and Appendix B")
    ).toEqual(["protocol.pdf", "Appendix B"]);
  });

  it("splits leftover and after a pdf when the remainder is an attached file", () => {
    expect(
      splitSourceCitationParts("protocol.pdf and E-PR-071", ["E-PR-071.pdf"])
    ).toEqual(["protocol.pdf", "E-PR-071"]);
  });

  it("does not peel an English title just because unrelated files are attached", () => {
    expect(
      splitSourceCitationParts("QDF-Filling and capping machine.pdf, p. 2", [
        "E-PR-068.pdf",
        "E-PR-071.pdf",
        "protocol.pdf",
      ])
    ).toEqual(["QDF-Filling and capping machine.pdf, p. 2"]);
  });

  it("peels an English and-title only when both sides are attached files", () => {
    expect(
      splitSourceCitationParts("QDF-Filling and capping machine.pdf, p. 2", [
        "QDF-Filling.pdf",
        "capping machine.pdf",
      ])
    ).toEqual(["QDF-Filling", "capping machine.pdf, p. 2"]);
  });

  it("still splits two-extension and-cites even when a combined name is known", () => {
    expect(
      splitSourceCitationParts("E-PR-068.pdf, p. 1 and E-PR-071.pdf, p. 1", [
        "E-PR-068 and E-PR-071.pdf",
      ])
    ).toEqual(["E-PR-068.pdf, p. 1", "E-PR-071.pdf, p. 1"]);
  });

  it("does not split and inside a pdf filename", () => {
    expect(
      splitSourceCitationParts(
        "URS-FP-21-006 vial washinh, sterilization, filling and sealing machine.pdf, p. 16"
      )
    ).toEqual([
      "URS-FP-21-006 vial washinh, sterilization, filling and sealing machine.pdf, p. 16",
    ]);
  });

  it("does not peel a hyphenated title word before and in a pdf filename", () => {
    expect(
      splitSourceCitationParts("QDF-Filling and capping machine.pdf, p. 2")
    ).toEqual(["QDF-Filling and capping machine.pdf, p. 2"]);
  });

  it("does not peel a digit-bearing id before English title words", () => {
    expect(
      splitSourceCitationParts(
        "PRQR-25-PR-005 and filling and capping machine.pdf, p. 1"
      )
    ).toEqual(["PRQR-25-PR-005 and filling and capping machine.pdf, p. 1"]);
  });

  it("keeps repeated p. N lists on one file", () => {
    expect(
      splitSourceCitationParts(
        "Master PMC-PR-014-R03 Filling and Capping Machine.pdf, p. 1, p. 2"
      )
    ).toEqual([
      "Master PMC-PR-014-R03 Filling and Capping Machine.pdf, p. 1, p. 2",
    ]);
  });

  it("splits two filenames without pages", () => {
    expect(splitSourceCitationParts("fileA.pdf, fileB.pdf")).toEqual([
      "fileA.pdf",
      "fileB.pdf",
    ]);
  });

  it("splits semicolon-combined files including a page range", () => {
    expect(
      splitSourceCitationParts(
        "Alarm trend 01 April to 30 June 25 (2).pdf, p. 1; AAP-E-PR-070-036-R00 List of alarm and their action plan Filling.pdf, p. 1-3"
      )
    ).toEqual([
      "Alarm trend 01 April to 30 June 25 (2).pdf, p. 1",
      "AAP-E-PR-070-036-R00 List of alarm and their action plan Filling.pdf, p. 1-3",
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

  it("keeps a comma-in-filename cite as one whole-bracket link", () => {
    const match =
      "[URS-FP-21-006 vial washinh, sterilization, filling and sealing machine.pdf, p. 16]";
    expect(sourceCitationLinkSpans(match)).toEqual([
      { from: 0, to: match.length, openRaw: match },
    ]);
  });

  it("keeps a repeated p. N cite as one whole-bracket link", () => {
    const match =
      "[Master PMC-PR-014-R03 Filling and Capping Machine.pdf, p. 1, p. 2]";
    expect(sourceCitationLinkSpans(match)).toEqual([
      { from: 0, to: match.length, openRaw: match },
    ]);
  });

  it("keeps a hyphenated-and filename cite as one whole-bracket link", () => {
    const match = "[QDF-Filling and capping machine.pdf, p. 2]";
    expect(sourceCitationLinkSpans(match)).toEqual([
      { from: 0, to: match.length, openRaw: match },
    ]);
  });

  it("keeps a compact-id-and-English-title cite as one whole-bracket link", () => {
    const match = "[E-PR-068 and E-PR-071 filling report.pdf, p. 1]";
    expect(sourceCitationLinkSpans(match)).toEqual([
      { from: 0, to: match.length, openRaw: match },
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

  it("makes two inner links for an and-combined cite only when both files are known", () => {
    const match = "[E-PR-068 and E-PR-071.pdf, p. 1]";
    expect(isCitationShapedBracket(match)).toBe(true);
    expect(sourceCitationLinkSpans(match)).toEqual([
      { from: 0, to: match.length, openRaw: match },
    ]);
    const spans = sourceCitationLinkSpans(match, [
      "E-PR-068.pdf",
      "E-PR-071.pdf",
    ]);
    expect(spans).toHaveLength(2);
    expect(spans[0]?.openRaw).toBe("[E-PR-068]");
    expect(spans[1]?.openRaw).toBe("[E-PR-071.pdf, p. 1]");
    expect(match.slice(spans[0]!.from, spans[0]!.to)).toBe("E-PR-068");
    expect(match.slice(spans[1]!.from, spans[1]!.to)).toBe(
      "E-PR-071.pdf, p. 1"
    );
  });
});

describe("canonicalizeSourceCitationBracket", () => {
  it("strips a QMS download stamp from a parked filename cite", () => {
    expect(
      canonicalizeSourceCitationBracket(
        "[PQR-24-PR-102_20250320092518.pdf, p. 1]"
      )
    ).toBe("[PQR-24-PR-102.pdf, p. 1]");
  });

  it("leaves underscored titles and ordinary filenames unchanged", () => {
    expect(
      canonicalizeSourceCitationBracket(
        "[790-00134R_Rev_U_Solea_Model_3_Software_Design_Verification_Test_Report_(Report_Only).docx, p. 1]"
      )
    ).toBe(
      "[790-00134R_Rev_U_Solea_Model_3_Software_Design_Verification_Test_Report_(Report_Only).docx, p. 1]"
    );
    expect(canonicalizeSourceCitationBracket("[protocol.pdf, p. 3]")).toBe(
      "[protocol.pdf, p. 3]"
    );
  });
});

describe("id-shaped cites are checked against this report's attachments", () => {
  const attachmentId = "me1q4zzhb1me0wwskpmqfw7i";
  const analysisId = "zbud2fet70yu88pvfpccjtko";

  it("does not linkify an id that is not an attachment on this report", () => {
    // An analysis id is the same 24 lowercase chars as an attachment id. One
    // reached a report's Citations list rendered as a live source link.
    expect(
      sourceCitationLinkSpans(`[${analysisId}]`, [], [attachmentId])
    ).toEqual([]);
  });

  it("still linkifies a real attachment id", () => {
    expect(
      sourceCitationLinkSpans(`[${attachmentId}]`, [], [attachmentId])
    ).toHaveLength(1);
  });

  it("keeps shape-only behaviour when the caller has no id list", () => {
    // Chat and suggestion surfaces do not all know the attachment ids; they
    // must not lose citation links because of this guard.
    expect(sourceCitationLinkSpans(`[${analysisId}]`)).toHaveLength(1);
  });

  it("matches ids case-insensitively and handles a page suffix", () => {
    expect(
      sourceCitationLinkSpans(`[${attachmentId}, p. 3]`, [], [
        attachmentId.toUpperCase(),
      ])
    ).toHaveLength(1);
  });

  it("leaves ordinary filename cites alone", () => {
    expect(
      sourceCitationLinkSpans("[RIG25014.pdf, p. 13]", [], [attachmentId])
    ).toHaveLength(1);
  });
});
