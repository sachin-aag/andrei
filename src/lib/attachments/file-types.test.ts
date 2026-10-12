import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_ACCEPT_ATTR,
  attachmentKindLabel,
  canonicalAttachmentMime,
  CSV_MIME_TYPE,
  DOCX_MIME_TYPE,
  hasSupportedAttachmentExtension,
  isSpreadsheetKind,
  isSupportedAttachment,
  kindFromMime,
  PDF_MIME_TYPE,
  resolveAttachmentKind,
  usesHtmlPreview,
  XLSX_MIME_TYPE,
} from "@/lib/attachments/file-types";

describe("resolveAttachmentKind", () => {
  it("resolves PDFs by extension and MIME", () => {
    expect(
      resolveAttachmentKind({ filename: "a.pdf", mimeType: PDF_MIME_TYPE })
    ).toBe("pdf");
  });

  it("resolves DOCX by extension and MIME", () => {
    expect(
      resolveAttachmentKind({ filename: "a.docx", mimeType: DOCX_MIME_TYPE })
    ).toBe("docx");
  });

  it("treats the extension as authoritative when the browser omits the type", () => {
    expect(resolveAttachmentKind({ filename: "report.docx", mimeType: "" })).toBe(
      "docx"
    );
    expect(
      resolveAttachmentKind({
        filename: "report.docx",
        mimeType: "application/octet-stream",
      })
    ).toBe("docx");
    expect(
      resolveAttachmentKind({
        filename: "results.csv",
        mimeType: "application/vnd.ms-excel",
      })
    ).toBe("csv");
    expect(resolveAttachmentKind({ filename: "book.xlsx", mimeType: "" })).toBe(
      "xlsx"
    );
  });

  it("rejects a known MIME that contradicts the extension", () => {
    expect(
      resolveAttachmentKind({ filename: "a.docx", mimeType: PDF_MIME_TYPE })
    ).toBeNull();
  });

  it("rejects unsupported extensions (e.g. legacy .doc / .xls)", () => {
    expect(resolveAttachmentKind({ filename: "a.doc" })).toBeNull();
    expect(resolveAttachmentKind({ filename: "a.xls" })).toBeNull();
    expect(resolveAttachmentKind({ filename: "a.txt" })).toBeNull();
    expect(resolveAttachmentKind({ filename: "noext" })).toBeNull();
  });
});

describe("canonicalAttachmentMime", () => {
  it("returns the canonical MIME even when the browser reported none", () => {
    expect(canonicalAttachmentMime({ filename: "a.docx", mimeType: "" })).toBe(
      DOCX_MIME_TYPE
    );
    expect(canonicalAttachmentMime({ filename: "a.pdf" })).toBe(PDF_MIME_TYPE);
    expect(canonicalAttachmentMime({ filename: "a.csv" })).toBe(CSV_MIME_TYPE);
    expect(canonicalAttachmentMime({ filename: "a.xlsx" })).toBe(XLSX_MIME_TYPE);
  });

  it("returns null for unsupported files", () => {
    expect(canonicalAttachmentMime({ filename: "a.doc" })).toBeNull();
  });
});

describe("kindFromMime", () => {
  it("maps canonical MIME types and tolerates parameters/case", () => {
    expect(kindFromMime(`${PDF_MIME_TYPE}; charset=binary`)).toBe("pdf");
    expect(kindFromMime(DOCX_MIME_TYPE.toUpperCase())).toBe("docx");
    expect(kindFromMime("application/csv")).toBe("csv");
    expect(kindFromMime(XLSX_MIME_TYPE)).toBe("xlsx");
    expect(kindFromMime("text/plain")).toBeNull();
    expect(kindFromMime(null)).toBeNull();
  });
});

describe("isSupportedAttachment / accept attr", () => {
  it("accepts pdf, docx, csv, and xlsx", () => {
    expect(isSupportedAttachment({ filename: "a.pdf" })).toBe(true);
    expect(isSupportedAttachment({ filename: "a.docx" })).toBe(true);
    expect(isSupportedAttachment({ filename: "a.csv" })).toBe(true);
    expect(isSupportedAttachment({ filename: "a.xlsx" })).toBe(true);
    expect(isSupportedAttachment({ filename: "a.png" })).toBe(false);
  });

  it("advertises all types in the accept attribute", () => {
    expect(ATTACHMENT_ACCEPT_ATTR).toContain(".pdf");
    expect(ATTACHMENT_ACCEPT_ATTR).toContain(".docx");
    expect(ATTACHMENT_ACCEPT_ATTR).toContain(".csv");
    expect(ATTACHMENT_ACCEPT_ATTR).toContain(".xlsx");
    expect(ATTACHMENT_ACCEPT_ATTR).toContain(DOCX_MIME_TYPE);
    expect(ATTACHMENT_ACCEPT_ATTR).toContain(XLSX_MIME_TYPE);
  });
});

describe("hasSupportedAttachmentExtension", () => {
  it("matches supported extensions on bare and spaced filenames", () => {
    expect(hasSupportedAttachmentExtension("a.pdf")).toBe(true);
    expect(hasSupportedAttachmentExtension("protocol.docx")).toBe(true);
    expect(hasSupportedAttachmentExtension("results.csv")).toBe(true);
    expect(hasSupportedAttachmentExtension("book.xlsx")).toBe(true);
    expect(
      hasSupportedAttachmentExtension("DV Requriements Convergent Dental.pdf")
    ).toBe(true);
    expect(hasSupportedAttachmentExtension("notes.txt")).toBe(false);
    expect(hasSupportedAttachmentExtension("batch number")).toBe(false);
  });
});

describe("preview helpers", () => {
  it("labels kinds and routes Word/CSV/Excel to HTML preview", () => {
    expect(attachmentKindLabel("csv")).toBe("CSV spreadsheet");
    expect(attachmentKindLabel("xlsx")).toBe("Excel spreadsheet");
    expect(usesHtmlPreview("docx")).toBe(true);
    expect(usesHtmlPreview("csv")).toBe(true);
    expect(usesHtmlPreview("xlsx")).toBe(true);
    expect(usesHtmlPreview("pdf")).toBe(false);
    expect(isSpreadsheetKind("csv")).toBe(true);
    expect(isSpreadsheetKind("pdf")).toBe(false);
  });
});
