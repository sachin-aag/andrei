import { describe, expect, it, vi } from "vitest";
import { openCitedDocument } from "@/lib/citations/open-cited-document";

const attachments = [{ id: "att_1", filename: "protocol.pdf" }];

describe("openCitedDocument", () => {
  it("opens the matching file at the cited page", () => {
    const openDocument = vi.fn();
    expect(
      openCitedDocument({
        raw: "[protocol.pdf, p. 3]",
        attachments,
        openDocument,
      })
    ).toEqual({ status: "opened", attachmentId: "att_1", page: 3 });
    expect(openDocument).toHaveBeenCalledWith("att_1", 3);
  });

  it("opens page 1 when the cite has no page", () => {
    const openDocument = vi.fn();
    expect(
      openCitedDocument({
        raw: "[protocol.pdf]",
        attachments,
        openDocument,
      })
    ).toEqual({ status: "opened", attachmentId: "att_1", page: 1 });
    expect(openDocument).toHaveBeenCalledWith("att_1", 1);
  });

  it("jumps to the first page of a multi-page cite", () => {
    const openDocument = vi.fn();
    expect(
      openCitedDocument({
        raw: "[protocol.pdf, p. 4, 26]",
        attachments,
        openDocument,
      }).status
    ).toBe("opened");
    expect(openDocument).toHaveBeenCalledWith("att_1", 4);
  });

  it("opens the first file when two sources share one bracket", () => {
    const openDocument = vi.fn();
    const files = [
      { id: "att_rtm", filename: "RTM for E-PR-068,.pdf" },
      { id: "att_csv", filename: "CSV-RTM-PR-053.pdf" },
    ];
    expect(
      openCitedDocument({
        raw: "[RTM for E-PR-068,.pdf, p. 100, CSV-RTM-PR-053.pdf, p. 5]",
        attachments: files,
        openDocument,
      })
    ).toEqual({ status: "opened", attachmentId: "att_rtm", page: 100 });
    expect(openDocument).toHaveBeenCalledWith("att_rtm", 100);
  });

  it("opens an exact combined filename even when the parser would peel and", () => {
    const openDocument = vi.fn();
    expect(
      openCitedDocument({
        raw: "[E-PR-068 and E-PR-071.pdf, p. 1]",
        attachments: [
          { id: "att_combo", filename: "E-PR-068 and E-PR-071.pdf" },
        ],
        openDocument,
      })
    ).toEqual({ status: "opened", attachmentId: "att_combo", page: 1 });
    expect(openDocument).toHaveBeenCalledWith("att_combo", 1);
  });

  it("opens the first file of a compact two-file cite when those files are attached separately", () => {
    const openDocument = vi.fn();
    expect(
      openCitedDocument({
        raw: "[E-PR-068 and E-PR-071.pdf, p. 1]",
        attachments: [
          { id: "att_068", filename: "E-PR-068.pdf" },
          { id: "att_071", filename: "E-PR-071.pdf" },
        ],
        openDocument,
      })
    ).toEqual({ status: "opened", attachmentId: "att_068", page: 1 });
    expect(openDocument).toHaveBeenCalledWith("att_068", 1);
  });

  it("opens a short citation against a QMS download-stamped stored filename", () => {
    const openDocument = vi.fn();
    expect(
      openCitedDocument({
        raw: "[PQR-24-PR-102.pdf, p. 1]",
        attachments: [
          {
            id: "att_pqr",
            filename: "PQR-24-PR-102_20250320092518.pdf",
          },
        ],
        openDocument,
      })
    ).toEqual({ status: "opened", attachmentId: "att_pqr", page: 1 });
    expect(openDocument).toHaveBeenCalledWith("att_pqr", 1);
  });

  it("does not open when the file is not on the report", () => {
    const openDocument = vi.fn();
    expect(
      openCitedDocument({
        raw: "[missing.pdf, p. 2]",
        attachments,
        openDocument,
      })
    ).toEqual({ status: "missing" });
    expect(openDocument).not.toHaveBeenCalled();
  });

  it("does not open a numeric marker without a source bracket", () => {
    const openDocument = vi.fn();
    expect(
      openCitedDocument({
        raw: "[1]",
        attachments,
        openDocument,
      })
    ).toEqual({ status: "unresolved" });
    expect(openDocument).not.toHaveBeenCalled();
  });
});
