import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_ACCEPT_ATTR,
  canonicalAttachmentMime,
  DOCX_MIME_TYPE,
  hasSupportedAttachmentExtension,
  isSupportedAttachment,
  kindFromMime,
  PDF_MIME_TYPE,
  resolveAttachmentKind,
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
  });

  it("rejects a known MIME that contradicts the extension", () => {
    expect(
      resolveAttachmentKind({ filename: "a.docx", mimeType: PDF_MIME_TYPE })
    ).toBeNull();
  });

  it("rejects unsupported extensions (e.g. legacy .doc)", () => {
    expect(resolveAttachmentKind({ filename: "a.doc" })).toBeNull();
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
  });

  it("returns null for unsupported files", () => {
    expect(canonicalAttachmentMime({ filename: "a.doc" })).toBeNull();
  });
});

describe("kindFromMime", () => {
  it("maps canonical MIME types and tolerates parameters/case", () => {
    expect(kindFromMime(`${PDF_MIME_TYPE}; charset=binary`)).toBe("pdf");
    expect(kindFromMime(DOCX_MIME_TYPE.toUpperCase())).toBe("docx");
    expect(kindFromMime("text/plain")).toBeNull();
    expect(kindFromMime(null)).toBeNull();
  });
});

describe("isSupportedAttachment / accept attr", () => {
  it("accepts pdf and docx", () => {
    expect(isSupportedAttachment({ filename: "a.pdf" })).toBe(true);
    expect(isSupportedAttachment({ filename: "a.docx" })).toBe(true);
    expect(isSupportedAttachment({ filename: "a.png" })).toBe(false);
  });

  it("advertises both types in the accept attribute", () => {
    expect(ATTACHMENT_ACCEPT_ATTR).toContain(".pdf");
    expect(ATTACHMENT_ACCEPT_ATTR).toContain(".docx");
    expect(ATTACHMENT_ACCEPT_ATTR).toContain(DOCX_MIME_TYPE);
  });
});

describe("hasSupportedAttachmentExtension", () => {
  it("matches supported extensions on bare and spaced filenames", () => {
    expect(hasSupportedAttachmentExtension("a.pdf")).toBe(true);
    expect(hasSupportedAttachmentExtension("protocol.docx")).toBe(true);
    expect(
      hasSupportedAttachmentExtension("DV Requriements Convergent Dental.pdf")
    ).toBe(true);
    expect(hasSupportedAttachmentExtension("notes.txt")).toBe(false);
    expect(hasSupportedAttachmentExtension("batch number")).toBe(false);
  });
});
