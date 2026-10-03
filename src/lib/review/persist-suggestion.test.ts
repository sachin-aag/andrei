import { beforeEach, describe, expect, it, vi } from "vitest";

const { insert, insertValues } = vi.hoisted(() => {
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  return { insert, insertValues };
});

vi.mock("@/db", () => ({ db: { insert } }));

import { persistLocatedEdit } from "@/lib/review/persist-suggestion";
import type { ReviewRunContext } from "@/lib/review/types";

const narrative = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "The batch BN100 was quarantined." }],
    },
  ],
};

function ctx(): ReviewRunContext {
  return {
    report: { id: "r1", documentNo: "DEV-1", metadata: {} } as never,
    user: { id: "u1" } as never,
    documentType: "investigation_report",
    sections: { define: { narrative } },
    sectionRows: [{ id: "s1", section: "define" }],
    evaluations: [],
    comments: [],
    attachmentFilenames: [],
    attachmentByFilename: new Map(),
    attachmentPages: [],
  };
}

describe("persistLocatedEdit", () => {
  beforeEach(() => {
    insert.mockClear();
    insertValues.mockClear();
  });

  it("stores an ai_grammar comment and returns a fixable finding with commentId", async () => {
    const finding = await persistLocatedEdit({
      ctx: ctx(),
      section: "define",
      contentPath: "narrative",
      edit: {
        anchorText: "BN100",
        deleteText: "BN100",
        insertText: "BN-100",
      },
      reasoning: "Normalize the batch number.",
      kind: "ai_grammar",
    });
    expect(finding?.kind).toBe("fixable");
    expect(finding?.commentId).toEqual(expect.any(String));
    expect(insert).toHaveBeenCalled();
    const values = insertValues.mock.calls[0]?.[0] as { kind: string };
    expect(values.kind).toBe("ai_grammar");
  });

  it("returns null when the span is not locatable", async () => {
    const finding = await persistLocatedEdit({
      ctx: ctx(),
      section: "define",
      contentPath: "narrative",
      edit: {
        anchorText: "does-not-exist",
        deleteText: "does-not-exist",
        insertText: "x",
      },
      reasoning: "Missing span.",
      kind: "ai_fix",
    });
    expect(finding).toBeNull();
    expect(insertValues).not.toHaveBeenCalled();
  });
});
