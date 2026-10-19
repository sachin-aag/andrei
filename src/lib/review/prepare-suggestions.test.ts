import { beforeEach, describe, expect, it, vi } from "vitest";

const { insert, insertValues } = vi.hoisted(() => {
  const insertValues = vi.fn().mockResolvedValue(undefined);
  return { insertValues, insert: vi.fn(() => ({ values: insertValues })) };
});
vi.mock("@/db", () => ({ db: { insert } }));

const generateSuggestionsForSection = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/suggest", () => ({ generateSuggestionsForSection }));

import { prepareFindingSuggestions } from "@/lib/review/prepare-suggestions";
import type { ReviewFindingDraft, ReviewRunContext } from "@/lib/review/types";

const narrative = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "The batch BN100 was quarantined on 12 Jan 2024." }],
    },
  ],
};

function ctx(): ReviewRunContext {
  return {
    report: { id: "r1", documentNo: "DEV-1", date: "2026-01-01", metadata: {} } as never,
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

function finding(overrides: Partial<ReviewFindingDraft> = {}): ReviewFindingDraft {
  return {
    section: "define",
    contentPath: "narrative",
    anchorText: "quarantined on 12 Jan 2024",
    message: "Uncited date: “12 Jan 2024”.",
    severity: "major",
    kind: "needs_human",
    metadata: { focusText: "12 Jan 2024" },
    ...overrides,
  };
}

describe("prepareFindingSuggestions", () => {
  beforeEach(() => {
    insert.mockClear();
    insertValues.mockClear();
    generateSuggestionsForSection.mockReset();
    vi.stubEnv("ALLOW_TEST_STUB_REVIEW", "true");
  });

  it("drafts an exact edit at run time so Apply only places it", async () => {
    const [prepared] = await prepareFindingSuggestions({
      ctx: ctx(),
      checkId: "citations.uncited_facts",
      findings: [finding()],
    });
    expect(prepared).toMatchObject({
      kind: "fixable",
      metadata: {
        focusText: "12 Jan 2024",
        proposedEdit: {
          kind: "ai_fix",
          anchorText: "quarantined on 12 Jan 2024",
          deleteText: "12 Jan 2024",
          insertText: "12 Jan 2024 <verify>",
        },
      },
    });
    expect(insert).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("leaves a finding for human review when no draft lands", async () => {
    const [prepared] = await prepareFindingSuggestions({
      ctx: ctx(),
      checkId: "citations.uncited_facts",
      findings: [finding({ anchorText: "not in the field", metadata: { focusText: "nope" } })],
    });
    expect(prepared?.kind).toBe("needs_human");
    expect(prepared?.metadata?.proposedEdit).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("saves criterion suggestions as held comments, one AI Check pass per section", async () => {
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
    const findings = await prepareFindingSuggestions({
      ctx: ctx(),
      checkId: "report.criteria.define",
      findings: [
        finding({
          contentPath: null,
          anchorText: "",
          message: "Problem statement: missing batch number.",
          severity: "critical",
          metadata: {
            criterionKey: "define.problem",
            criterionLabel: "Problem statement",
            evaluationId: "e1",
          },
        }),
        finding({
          contentPath: null,
          anchorText: "",
          message: "Timeline: no dates.",
          metadata: { criterionKey: "define.timeline", evaluationId: "e2" },
        }),
      ],
    });

    expect(generateSuggestionsForSection).toHaveBeenCalledOnce();
    expect(generateSuggestionsForSection.mock.calls[0]![0].gapCriteria).toEqual([
      expect.objectContaining({
        criterionLabel: "Problem statement",
        evaluationId: "e1",
        status: "not_met",
      }),
      expect.objectContaining({
        criterionLabel: "define.timeline",
        evaluationId: "e2",
        status: "partially_met",
      }),
    ]);
    expect(findings[0]).toMatchObject({ kind: "fixable", commentId: expect.any(String) });
    expect(findings[1]?.commentId).toBeUndefined();
    const saved = insertValues.mock.calls[0]![0] as { evaluationId: string | null; content: string };
    expect(saved.evaluationId).toBeNull();
    expect(saved.content).not.toContain("releasedToQueue");
    vi.unstubAllEnvs();
  });
});
