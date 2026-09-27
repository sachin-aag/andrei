import { describe, expect, it } from "vitest";
import {
  isInternalIdToken,
  rewriteInternalIdsForDisplay,
} from "@/lib/citations/rewrite-internal-ids";

const ATTACHMENT_ID = "me1q4zzhb1me0wwskpmqfw7i";
const ANALYSIS_ID = "zbud2fet70yu88pvfpccjtko";

describe("isInternalIdToken", () => {
  it("accepts default CUID2 tokens and rejects filenames", () => {
    expect(isInternalIdToken(ATTACHMENT_ID)).toBe(true);
    expect(isInternalIdToken("protocol.pdf")).toBe(false);
    expect(isInternalIdToken("PRQR-25-PR-005")).toBe(false);
  });
});

describe("rewriteInternalIdsForDisplay", () => {
  const lookup = {
    filenameByAttachmentId: new Map([
      [ATTACHMENT_ID, "Lab Results_20250320092518.pdf"],
    ]),
    labelById: new Map([[ANALYSIS_ID, "Assay scatter"]]),
  };

  it("turns an attachment-id citation into a filename cite", () => {
    expect(
      rewriteInternalIdsForDisplay(
        `Output met spec [${ATTACHMENT_ID}, p. 3] today.`,
        lookup
      )
    ).toBe("Output met spec [Lab Results.pdf, p. 3] today.");
  });

  it("replaces a bare attachment id and an id= assignment", () => {
    expect(
      rewriteInternalIdsForDisplay(
        `See ${ATTACHMENT_ID} and id=${ATTACHMENT_ID}.`,
        lookup
      )
    ).toBe("See Lab Results.pdf and Lab Results.pdf.");
    expect(
      rewriteInternalIdsForDisplay(
        `attachmentId=${ATTACHMENT_ID} analysisId=${ANALYSIS_ID}`,
        lookup
      )
    ).toBe("Lab Results.pdf Assay scatter");
  });

  it("names a plot instead of showing its analysis id", () => {
    expect(
      rewriteInternalIdsForDisplay(`Inserted [${ANALYSIS_ID}].`, lookup)
    ).toBe("Inserted Assay scatter.");
    expect(
      rewriteInternalIdsForDisplay(`Assay scatter (${ANALYSIS_ID})`, lookup)
    ).toBe("Assay scatter");
  });

  it("leaves ordinary filename cites and unknown tokens alone", () => {
    expect(
      rewriteInternalIdsForDisplay(
        "Met spec [protocol.pdf, p. 3] for configuration A.",
        lookup
      )
    ).toBe("Met spec [protocol.pdf, p. 3] for configuration A.");
    expect(
      rewriteInternalIdsForDisplay(`[${"a".repeat(24)}]`, lookup)
    ).toBe(`[${"a".repeat(24)}]`);
  });

  it("returns the original text when there is nothing to look up", () => {
    expect(
      rewriteInternalIdsForDisplay(`See [${ATTACHMENT_ID}].`, {})
    ).toBe(`See [${ATTACHMENT_ID}].`);
  });
});
