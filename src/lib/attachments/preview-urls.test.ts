import { describe, expect, it } from "vitest";
import { DOCX_MIME_TYPE, PDF_MIME_TYPE } from "@/lib/attachments/file-types";
import {
  attachmentDownloadHref,
  attachmentPreviewSrc,
  libraryDownloadHref,
  libraryPreviewSrc,
} from "@/lib/attachments/preview-urls";

describe("attachmentPreviewSrc", () => {
  it("streams PDFs same-origin for canvas/image preview", () => {
    expect(
      attachmentPreviewSrc({
        reportId: "report-1",
        attachmentId: "att-1",
        mimeType: PDF_MIME_TYPE,
        page: 3,
      })
    ).toBe("/api/reports/report-1/attachments/att-1/content?proxy=1&page=3");
  });

  it("uses the server-rendered HTML preview for Word documents", () => {
    expect(
      attachmentPreviewSrc({
        reportId: "report-1",
        attachmentId: "att-2",
        mimeType: DOCX_MIME_TYPE,
        page: 1,
      })
    ).toBe("/api/reports/report-1/attachments/att-2/preview");
  });
});

describe("attachmentDownloadHref", () => {
  it("does not proxy downloads through the iframe path", () => {
    expect(attachmentDownloadHref("report-1", "att-1")).toBe(
      "/api/reports/report-1/attachments/att-1/content?download=1"
    );
  });
});

describe("libraryPreviewSrc", () => {
  it("streams library PDFs same-origin for canvas preview", () => {
    expect(
      libraryPreviewSrc({
        assetId: "asset-1",
        mimeType: PDF_MIME_TYPE,
        page: 2,
      })
    ).toBe("/api/attachment-library/asset-1/content?proxy=1&page=2");
  });

  it("uses the server-rendered HTML preview for library Word documents", () => {
    expect(
      libraryPreviewSrc({
        assetId: "asset-2",
        mimeType: DOCX_MIME_TYPE,
        page: 1,
      })
    ).toBe("/api/attachment-library/asset-2/preview");
  });
});

describe("libraryDownloadHref", () => {
  it("requests a direct download for library assets", () => {
    expect(libraryDownloadHref("asset-1")).toBe(
      "/api/attachment-library/asset-1/content?download=1"
    );
  });
});
