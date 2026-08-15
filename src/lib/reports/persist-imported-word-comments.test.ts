import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistImportedWordComments } from "@/lib/reports/persist-imported-word-comments";
import { DEMO_PACK, getCustomerPack, MJ_PACK } from "@/lib/customers/packs";
import type { ImportedReportContent } from "@/lib/import/docx-to-sections";

const insertValues = vi.fn().mockReturnValue({
  returning: vi.fn().mockResolvedValue([{ id: "comment-1" }]),
});

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
  },
}));

vi.mock("@/lib/customers/packs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/customers/packs")>();
  return {
    ...actual,
    getCustomerPack: vi.fn(() => actual.DEMO_PACK),
  };
});

import { db } from "@/db";

function commentOn(
  section: ImportedReportContent["comments"][number]["section"]
) {
  return {
    parentExternalCommentId: null,
    externalCommentId: `ext-${section}`,
    externalAuthorName: "Reviewer",
    externalAuthorInitials: "R",
    externalCreatedAt: null,
    content: "note",
    anchorText: "anchor text long enough",
    section,
    contentPath: "narrative",
    fromPos: 0,
    toPos: 4,
  };
}

describe("persistImportedWordComments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCustomerPack).mockReturnValue(DEMO_PACK);
    vi.mocked(db.insert).mockReturnValue({ values: insertValues } as never);
  });

  it("skips comments whose section is hidden on the MJ pack", async () => {
    vi.mocked(getCustomerPack).mockReturnValue(MJ_PACK);
    await persistImportedWordComments("report-1", {
      sections: {} as ImportedReportContent["sections"],
      toolsUsed: { sixM: false, fiveWhy: false, brainstorming: false },
      header: {},
      comments: [commentOn("conclusion"), commentOn("define")],
    });

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ section: "define" })
    );
  });
});
