import { describe, expect, it } from "vitest";
import { citationDisplayFilename } from "./citation-filename";

describe("citationDisplayFilename", () => {
  it("strips a QMS download stamp before the extension", () => {
    expect(
      citationDisplayFilename("PQR-24-PR-102_20250320092518.pdf")
    ).toBe("PQR-24-PR-102.pdf");
    expect(
      citationDisplayFilename("PQR-24-PR-102_20250320092518.PDF")
    ).toBe("PQR-24-PR-102.PDF");
    expect(
      citationDisplayFilename("protocol_20190101120000.docx")
    ).toBe("protocol.docx");
  });

  it("leaves ordinary and underscored titles alone", () => {
    expect(citationDisplayFilename("PQR-24-PR-102.pdf")).toBe(
      "PQR-24-PR-102.pdf"
    );
    expect(
      citationDisplayFilename(
        "790-00134R_Rev_U_Solea_Model_3_Software_Design_Verification_Test_Report_(Report_Only).docx"
      )
    ).toBe(
      "790-00134R_Rev_U_Solea_Model_3_Software_Design_Verification_Test_Report_(Report_Only).docx"
    );
    expect(citationDisplayFilename("report_v2.pdf")).toBe("report_v2.pdf");
    expect(citationDisplayFilename("Attachment_XIV")).toBe("Attachment_XIV");
  });

  it("ignores a 14-digit run that is not a trailing stamp", () => {
    expect(citationDisplayFilename("scan_20250320092518_final.pdf")).toBe(
      "scan_20250320092518_final.pdf"
    );
  });
});
