import { describe, expect, it } from "vitest";
import { CSV_MIME_TYPE, XLSX_MIME_TYPE } from "./file-types";
import {
  formatVaultByteSize,
  vaultItemKindLabel,
} from "./library-display";

describe("formatVaultByteSize", () => {
  it("uses KB and MB without trailing zeros", () => {
    expect(formatVaultByteSize(1200)).toBe("1.2 KB");
    expect(formatVaultByteSize(10_240)).toBe("10 KB");
    expect(formatVaultByteSize(33_600_000)).toBe("32 MB");
  });
});

describe("vaultItemKindLabel", () => {
  it("labels folders and PDF/Word/CSV/Excel files", () => {
    expect(vaultItemKindLabel({ isFolder: true })).toBe("Folder");
    expect(
      vaultItemKindLabel({ isFolder: false, mimeType: "application/pdf" })
    ).toBe("PDF document");
    expect(
      vaultItemKindLabel({ isFolder: false, mimeType: CSV_MIME_TYPE })
    ).toBe("CSV spreadsheet");
    expect(
      vaultItemKindLabel({ isFolder: false, mimeType: XLSX_MIME_TYPE })
    ).toBe("Excel spreadsheet");
  });
});
