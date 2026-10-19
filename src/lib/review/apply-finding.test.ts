import { beforeEach, describe, expect, it, vi } from "vitest";

const { select, update, insert } = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock("@/db", () => ({ db: { select, update, insert } }));

const generateSuggestionsForSection = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/suggest", () => ({ generateSuggestionsForSection }));

import { applyReviewFindingAsTrackedChange } from "@/lib/review/apply-finding";
import type { ReviewRunContext } from "@/lib/review/types";
import type { CommentRecord } from "@/types/report";

const narrative = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "The batch BN100 was quarantined." }],
    },
  ],
};

function comment(overrides: Partial<CommentRecord> = {}): CommentRecord {
  return {
    id: "c1",
    reportId: "r1",
    parentId: null,
    sectionId: "s1",
    section: "define",
    authorId: "ai",
    content: '{"deleteText":"BN100","insertText":"BN-100"}',
    anchorText: "BN100",
    contentPath: "narrative",
    fromPos: null,
    toPos: null,
    status: "open",
    kind: "ai_fix",
    source: "andrei",
    externalAuthorName: null,
    externalAuthorInitials: null,
    externalCommentId: null,
    externalCreatedAt: null,
    locked: false,
    evaluationId: "e1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function ctx(overrides: Partial<ReviewRunContext> = {}): ReviewRunContext {
  return {
    report: { id: "r1", documentNo: "DEV-1", date: "2026-01-01", metadata: {} } as never,
    user: { id: "u1" } as never,
    documentType: "investigation_report",
    sections: { define: { narrative } },
    sectionRows: [{ id: "s1", section: "define" }],
    evaluations: [
      {
        id: "e1",
        reportId: "r1",
        sectionId: "s1",
        section: "define",
        criterionKey: "define.problem",
        criterionLabel: "Problem statement",
        status: "not_met",
        reasoning: "Missing batch number.",
        bypassed: false,
        evaluatedContentHash: "h",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    comments: [],
    attachmentFilenames: [],
    attachmentByFilename: new Map(),
    attachmentPages: [],
    ...overrides,
  };
}

describe("applyReviewFindingAsTrackedChange", () => {
  beforeEach(() => {
    select.mockReset();
    update.mockReset();
    insert.mockClear();
    generateSuggestionsForSection.mockReset();
  });

  it("releases an existing live-finding comment onto the queue", async () => {
    const existing = comment();
    select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([existing]),
      })),
    });
    const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    update.mockReturnValue({ set });

    const result = await applyReviewFindingAsTrackedChange({
      ctx: ctx({ comments: [existing] }),
      findingId: "live:e1",
    });
    expect(result.commentId).toBe("c1");
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringMatching(/releasedToQueue/),
      })
    );
    expect(JSON.stringify(set.mock.calls)).toMatch(/releasedToQueue/);
  });

  it("persists a stored proposedEdit as a released comment", async () => {
    const findingRow = {
      id: "f1",
      reportId: "r1",
      checkId: "writing.grammar",
      runId: "run1",
      section: "define",
      contentPath: "narrative",
      anchorText: "BN100",
      message: "Normalize the batch number.",
      severity: "minor",
      kind: "fixable",
      commentId: null,
      status: "open",
      metadata: {
        proposedEdit: {
          kind: "ai_grammar",
          anchorText: "BN100",
          deleteText: "BN100",
          insertText: "BN-100",
        },
      },
    };
    select
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([findingRow]),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      });
    const returning = vi.fn().mockResolvedValue([{ ...findingRow, commentId: "new" }]);
    update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({ returning })),
      })),
    });

    const result = await applyReviewFindingAsTrackedChange({
      ctx: ctx(),
      findingId: "f1",
    });
    expect(result.commentId).toEqual(expect.any(String));
    expect(insert).toHaveBeenCalled();
  });

  it("refuses quickly when the run prepared no suggestion", async () => {
    select.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([
          {
            id: "f2",
            reportId: "r1",
            checkId: "citations.external_refs",
            runId: "run1",
            section: "define",
            contentPath: "narrative",
            anchorText: "BN100",
            message: "Please verify BN100.",
            severity: "major",
            kind: "needs_human",
            commentId: null,
            status: "open",
            metadata: { criterionKey: "define.problem", evaluationId: "e1" },
          },
        ]),
      })),
    });

    await expect(
      applyReviewFindingAsTrackedChange({ ctx: ctx(), findingId: "f2" })
    ).rejects.toMatchObject({
      status: 422,
      message: "No suggestion was automatically available. Human review is needed.",
    });
    expect(generateSuggestionsForSection).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("generates a released suggestion for a live criterion with no comment yet", async () => {
    generateSuggestionsForSection.mockResolvedValue({
      suggestions: [
        {
          targetField: "narrative",
          anchorText: "BN100",
          deleteText: "BN100",
          insertText: "BN-100",
          reasoning: "Use the hyphenated batch number.",
          evaluationId: "e1",
          criterionKey: "define.problem",
        },
      ],
      dropped: [],
    });
    select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([]),
      })),
    });

    const result = await applyReviewFindingAsTrackedChange({
      ctx: ctx(),
      findingId: "live:e1",
    });
    expect(result.commentId).toEqual(expect.any(String));
    expect(insert).toHaveBeenCalled();
    expect(generateSuggestionsForSection).toHaveBeenCalled();
  });
});
