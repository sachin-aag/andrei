import { describe, expect, it } from "vitest";
import { resolveCitedAttachment } from "@/lib/citations/resolve-cited-attachment";

const attachments = [
  { id: "att_protocol", filename: "protocol.pdf" },
  { id: "att_appendix", filename: "Appendix-B-790-00134R-RevU.pdf" },
  { id: "me1q4zzhb1me0wwskpmqfw7i", filename: "index-copy.pdf" },
];

describe("resolveCitedAttachment", () => {
  it("matches an exact filename case-insensitively", () => {
    expect(resolveCitedAttachment(attachments, "Protocol.PDF")).toEqual({
      status: "found",
      attachment: attachments[0],
    });
  });

  it("matches an attachment id the model copied from the index", () => {
    expect(
      resolveCitedAttachment(attachments, "me1q4zzhb1me0wwskpmqfw7i")
    ).toEqual({
      status: "found",
      attachment: attachments[2],
    });
  });

  it("uses a unique fuzzy filename match", () => {
    expect(
      resolveCitedAttachment(attachments, "790-00134R-RevU.pdf")
    ).toEqual({
      status: "found",
      attachment: attachments[1],
    });
  });

  it("prefers an exact filename over a fuzzy sibling", () => {
    const withOverlap = [
      { id: "att_report", filename: "report.pdf" },
      { id: "att_appendix", filename: "appendix-report.pdf" },
    ];
    expect(resolveCitedAttachment(withOverlap, "report.pdf")).toEqual({
      status: "found",
      attachment: withOverlap[0],
    });
  });

  it("returns missing when nothing matches", () => {
    expect(resolveCitedAttachment(attachments, "missing.docx")).toEqual({
      status: "missing",
    });
  });

  it("returns ambiguous when several files fuzzy-match and none is exact", () => {
    const twins = [
      { id: "a", filename: "protocol-rev-a.pdf" },
      { id: "b", filename: "protocol-rev-b.pdf" },
    ];
    expect(resolveCitedAttachment(twins, "protocol")).toEqual({
      status: "ambiguous",
    });
  });
});
