import { describe, expect, it } from "vitest";
import {
  annotateDividerSearchHits,
  isAttachmentDividerHit,
} from "./attachment-divider";

describe("isAttachmentDividerHit", () => {
  it("flags inbuilt/external calibration cover sheets", () => {
    expect(
      isAttachmentDividerHit({
        quote: "ATTACHMENT NO. 2- CALIBRATION CERTIFCATE OF INBUILT INSTRUMENT",
        text: "ATTACHMENT NO. 2",
        pageNumber: 32,
      })
    ).toBe(true);
    expect(
      isAttachmentDividerHit({
        quote: "ATTACHMENT NO. 3: CALIBRATION CERTIFICATE OF EXTERNAL INSTRUMENTS",
        text: "",
        pageNumber: 45,
      })
    ).toBe(true);
  });

  it("does not flag a certificate table that already has dates and cert numbers", () => {
    expect(
      isAttachmentDividerHit({
        quote:
          "Digital Caliper A23027070 as found 0.01 mm as left 0.01 mm due date 08/09/2025 certificate no 2024/1155 make Mitutoyo serial 12345 location filling line.",
        text: "Sr. No. | Instrument | ID | Due date | Cert. No.\n1 | Digital Caliper | A23027070 | 08/09/2025 | 2024/1155",
        pageNumber: 33,
      })
    ).toBe(false);
  });
});

describe("annotateDividerSearchHits", () => {
  it("keeps search open when every hit is a divider and points at the next page", () => {
    const annotated = annotateDividerSearchHits([
      {
        quote: "ATTACHMENT NO. 2- CALIBRATION CERTIFCATE OF INBUILT INSTRUMENT",
        text: "",
        pageNumber: 32,
      },
      {
        quote: "ATTACHMENT NO. 3: CALIBRATION CERTIFICATE OF EXTERNAL INSTRUMENTS",
        text: "",
        pageNumber: 45,
      },
    ]);
    expect(annotated.dividerHits).toBe(2);
    expect(annotated.keepSearchOpen).toBe(true);
    expect(annotated.results[0]).toMatchObject({
      divider: true,
      nextPage: 33,
    });
  });

  it("does not keep search open when a data page is in the same result set", () => {
    const annotated = annotateDividerSearchHits([
      {
        quote: "ATTACHMENT NO. 2- CALIBRATION CERTIFCATE OF INBUILT INSTRUMENT",
        text: "",
        pageNumber: 32,
      },
      {
        quote:
          "Digital Caliper A23027070 as found 0.01 mm as left 0.01 mm due date 08/09/2025 certificate no 2024/1155 make Mitutoyo serial 12345.",
        text: "1 | Digital Caliper | A23027070 | 08/09/2025 | 2024/1155",
        pageNumber: 33,
      },
    ]);
    expect(annotated.dividerHits).toBe(1);
    expect(annotated.keepSearchOpen).toBe(false);
  });
});
