import { describe, expect, it } from "vitest";
import {
  attachmentsZipFileName,
  buildAttachmentZipEntries,
  sanitizeZipSegment,
  uniqueZipPath,
} from "./zip-entry-paths";

describe("sanitizeZipSegment", () => {
  it("strips path separators and reserved characters", () => {
    expect(sanitizeZipSegment('a/b\\c:d*e?f"g<h>i|j', "document")).toBe(
      "a_b_c_d_e_f_g_h_i_j"
    );
  });

  it("rejects dot-only names that would be zip-slip segments", () => {
    expect(sanitizeZipSegment("..", "folder")).toBe("folder");
    expect(sanitizeZipSegment(".", "folder")).toBe("folder");
    expect(sanitizeZipSegment("...", "folder")).toBe("folder");
  });

  it("falls back when the name is blank after cleaning", () => {
    expect(sanitizeZipSegment("   ", "document")).toBe("document");
    expect(sanitizeZipSegment("", "document")).toBe("document");
  });
});

describe("uniqueZipPath", () => {
  it("appends a numeric suffix when the path is already used", () => {
    const used = new Set(["notes.pdf"]);
    expect(uniqueZipPath("notes.pdf", used)).toBe("notes (2).pdf");
    expect(uniqueZipPath("notes.pdf", used)).toBe("notes (3).pdf");
  });

  it("keeps the directory prefix when uniquing", () => {
    const used = new Set(["SOPs/sop.pdf"]);
    expect(uniqueZipPath("SOPs/sop.pdf", used)).toBe("SOPs/sop (2).pdf");
  });
});

describe("buildAttachmentZipEntries", () => {
  it("puts root files at the zip root and nests folder files", () => {
    const entries = buildAttachmentZipEntries(
      [
        { id: "f1", name: "SOPs", parentId: null },
        { id: "f2", name: "2026", parentId: "f1" },
      ],
      [
        {
          id: "a1",
          filename: "root.pdf",
          folderId: null,
          objectKey: "k1",
        },
        {
          id: "a2",
          filename: "sop.pdf",
          folderId: "f1",
          objectKey: "k2",
        },
        {
          id: "a3",
          filename: "jan.pdf",
          folderId: "f2",
          objectKey: "k3",
        },
      ]
    );

    expect(entries.map((entry) => entry.zipPath)).toEqual([
      "root.pdf",
      "SOPs/sop.pdf",
      "SOPs/2026/jan.pdf",
    ]);
  });

  it("hoists files whose folder is missing or cyclic to the zip root", () => {
    const missing = buildAttachmentZipEntries(
      [],
      [
        {
          id: "a1",
          filename: "orphan.pdf",
          folderId: "gone",
          objectKey: "k1",
        },
      ]
    );
    expect(missing[0]?.zipPath).toBe("orphan.pdf");

    const cyclic = buildAttachmentZipEntries(
      [
        { id: "f1", name: "One", parentId: "f2" },
        { id: "f2", name: "Two", parentId: "f1" },
      ],
      [
        {
          id: "a1",
          filename: "trapped.pdf",
          folderId: "f1",
          objectKey: "k1",
        },
      ]
    );
    expect(cyclic[0]?.zipPath).toBe("trapped.pdf");
  });

  it("uniques colliding filenames in the same folder", () => {
    const entries = buildAttachmentZipEntries(
      [{ id: "f1", name: "Batch Records", parentId: null }],
      [
        {
          id: "a1",
          filename: "coa.pdf",
          folderId: "f1",
          objectKey: "k1",
        },
        {
          id: "a2",
          filename: "coa.pdf",
          folderId: "f1",
          objectKey: "k2",
        },
      ]
    );
    expect(entries.map((entry) => entry.zipPath)).toEqual([
      "Batch Records/coa.pdf",
      "Batch Records/coa (2).pdf",
    ]);
  });
});

describe("attachmentsZipFileName", () => {
  it("sanitizes the document number", () => {
    expect(attachmentsZipFileName("DEV/QC 26-001")).toBe(
      "Attachments_DEV-QC_26-001.zip"
    );
  });

  it("falls back when the document number is empty", () => {
    expect(attachmentsZipFileName("")).toBe("Attachments_report.zip");
  });
});
