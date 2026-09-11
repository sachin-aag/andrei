import { describe, expect, it } from "vitest";
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
  it("labels folders and PDF/Word files", () => {
    expect(vaultItemKindLabel({ isFolder: true })).toBe("Folder");
    expect(
      vaultItemKindLabel({ isFolder: false, mimeType: "application/pdf" })
    ).toBe("PDF document");
  });
});
