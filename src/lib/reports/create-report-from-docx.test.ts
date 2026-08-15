import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_CONTENT } from "@/types/sections";
import { DEMO_PACK, getCustomerPack, MJ_PACK } from "@/lib/customers/packs";
import {
  investigationMetadataFromImport,
  sectionRowsForCreate,
} from "@/lib/reports/create-report-from-docx";
import type { ImportedReportContent } from "@/lib/import/docx-to-sections";

vi.mock("@/lib/customers/packs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/customers/packs")>();
  return {
    ...actual,
    getCustomerPack: vi.fn(() => actual.DEMO_PACK),
  };
});

const imported: ImportedReportContent = {
  sections: EMPTY_CONTENT,
  toolsUsed: { sixM: true, fiveWhy: false, brainstorming: false },
  header: { otherTools: "  fishbone  ", date: new Date("2026-01-15T00:00:00Z") },
  comments: [],
};

describe("create-report-from-docx", () => {
  beforeEach(() => {
    vi.mocked(getCustomerPack).mockReturnValue(DEMO_PACK);
  });

  it("copies tools used and trimmed otherTools into metadata", () => {
    expect(investigationMetadataFromImport(imported)).toEqual({
      toolsUsed: { sixM: true, fiveWhy: false, brainstorming: false },
      otherTools: "fishbone",
    });
  });

  it("seeds imported Define content and includes conclusion on demo", () => {
    const rows = sectionRowsForCreate("investigation_report", imported);
    expect(rows.find((row) => row.section === "define")?.content).toEqual(
      EMPTY_CONTENT.define
    );
    expect(rows.map((row) => row.section)).toContain("conclusion");
  });

  it("omits conclusion when the MJ pack is active", () => {
    vi.mocked(getCustomerPack).mockReturnValue(MJ_PACK);
    const rows = sectionRowsForCreate("investigation_report", imported);
    expect(rows.map((row) => row.section)).not.toContain("conclusion");
    expect(rows.map((row) => row.section)).toContain("define");
  });
});
