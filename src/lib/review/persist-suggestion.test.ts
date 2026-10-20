import { beforeEach, describe, expect, it, vi } from "vitest";

const { insert, insertValues, select, update } = vi.hoisted(() => {
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  const select = vi.fn();
  const update = vi.fn();
  return { insert, insertValues, select, update };
});

vi.mock("@/db", () => ({ db: { insert, select, update } }));

import {
  dismissReviewCreatedComments,
  persistLocatedEdit,
} from "@/lib/review/persist-suggestion";
import { locateProposedEdit } from "@/lib/review/locate-proposed-edit";
import { commentReleasedToQueue } from "@/lib/review/proposed-edit";
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

describe("locateProposedEdit", () => {
  beforeEach(() => {
    insert.mockClear();
    insertValues.mockClear();
  });

  it("returns a fixable finding with proposedEdit and does not insert a comment", () => {
    const finding = locateProposedEdit({
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
    expect(finding?.commentId).toBeNull();
    expect(finding?.metadata).toEqual({
      proposedEdit: {
        kind: "ai_grammar",
        anchorText: "BN100",
        deleteText: "BN100",
        insertText: "BN-100",
      },
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns null when the span is not locatable", () => {
    expect(
      locateProposedEdit({
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
      })
    ).toBeNull();
  });
});

describe("persistLocatedEdit", () => {
  beforeEach(() => {
    insert.mockClear();
    insertValues.mockClear();
  });

  it("inserts an open comment released to the suggestion queue", async () => {
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
    expect(finding?.commentId).toEqual(expect.any(String));
    expect(insert).toHaveBeenCalled();
    const values = insertValues.mock.calls[0]?.[0] as {
      kind: string;
      content: string;
    };
    expect(values.kind).toBe("ai_grammar");
    expect(commentReleasedToQueue(values.content)).toBe(true);
  });
});

describe("dismissReviewCreatedComments", () => {
  beforeEach(() => {
    select.mockReset();
    update.mockReset();
  });

  it("dismisses open comments that have no evaluationId", async () => {
    const from = vi.fn(() => ({
      where: vi.fn().mockResolvedValue([
        { id: "c1", content: '{"insertText":"BN-100"}' },
      ]),
    }));
    select.mockReturnValue({ from });
    const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    update.mockReturnValue({ set });

    await dismissReviewCreatedComments(["c1", "c1"]);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "dismissed" })
    );
  });
});
