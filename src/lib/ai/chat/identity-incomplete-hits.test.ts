import { describe, expect, it } from "vitest";
import {
  annotateIdentityIncompleteSearchHits,
  isIdentityIncompleteHit,
} from "./identity-incomplete-hits";

describe("isIdentityIncompleteHit", () => {
  it("treats SOP title lists without document numbers as incomplete", () => {
    expect(
      isIdentityIncompleteHit({
        quote:
          "Standard operating procedure for operation & cleaning. Standard operating procedure for Instruments calibration program. Training.",
      })
    ).toBe(true);
  });

  it("treats a named title page without identifier tokens as incomplete", () => {
    expect(
      isIdentityIncompleteHit({
        quote: "SOP Name Document Name Name of the Document Operation of GLR",
      })
    ).toBe(true);
  });

  it("treats two title-case document names without numbers as incomplete", () => {
    expect(
      isIdentityIncompleteHit({
        quote:
          "ISPE Baseline Guide Volume Five Commissioning. ISPE GAMP Five A Risk Based Approach.",
      })
    ).toBe(true);
  });

  it("is complete when the snippet carries an identifier-shaped token", () => {
    expect(
      isIdentityIncompleteHit({
        quote:
          "Standard operating procedure for operation & cleaning PRD-SOP-PS-019-00 Effective Date 16-05-2026",
      })
    ).toBe(false);
    expect(
      isIdentityIncompleteHit({
        quote: "Protocol No. QAD-SOP-FS-003-F11-00 Rev 01",
      })
    ).toBe(false);
  });

  it("does not flag a narrative sentence without titles or identifiers", () => {
    expect(
      isIdentityIncompleteHit({
        quote:
          "The installation qualification protocol was executed for this equipment.",
      })
    ).toBe(false);
  });
});

describe("annotateIdentityIncompleteSearchHits", () => {
  it("keeps search open when every hit is titles without identifiers", () => {
    const annotated = annotateIdentityIncompleteSearchHits([
      {
        quote:
          "Standard operating procedure for operation & cleaning. Standard operating procedure for Instruments calibration program.",
      },
    ]);
    expect(annotated.identityIncompleteHits).toBe(1);
    expect(annotated.keepSearchOpen).toBe(true);
    expect(annotated.results[0]?.identityIncomplete).toBe(true);
  });

  it("does not keep search open when a hit already has identifiers", () => {
    const annotated = annotateIdentityIncompleteSearchHits([
      {
        quote: "ENG-SOP-FS-001-00 Standard operating procedure for Instruments calibration program",
      },
    ]);
    expect(annotated.keepSearchOpen).toBe(false);
    expect(annotated.identityIncompleteHits).toBe(0);
  });
});
