import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONVERGENT_PACK,
  DEMO_PACK,
  getCustomerPack,
} from "@/lib/customers/packs";
import { buildImproveAiSessionView } from "@/lib/improve-ai/session-view";
import type {
  aiFeedbackResponses,
  aiFeedbackSessions,
  reports,
} from "@/db/schema";

vi.mock("@/lib/customers/packs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/customers/packs")>();
  return {
    ...actual,
    getCustomerPack: vi.fn(() => actual.DEMO_PACK),
  };
});

const narrative = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "This revision presents testing results for protocol 825-00001 Rev U.",
        },
      ],
    },
  ],
};

function session(
  overrides: Partial<typeof aiFeedbackSessions.$inferSelect> = {}
): typeof aiFeedbackSessions.$inferSelect {
  return {
    id: "session-1",
    reportId: "report-1",
    submittedBy: "user-1",
    sourceType: "existing_report",
    status: "ready_for_review",
    sourceLabel: "23456",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function report(
  overrides: Partial<typeof reports.$inferSelect> = {}
): typeof reports.$inferSelect {
  return {
    id: "report-1",
    documentType: "investigation_report",
    documentNo: "23456",
    date: new Date("2026-01-01"),
    metadata: {},
    status: "draft",
    authorId: "user-1",
    assignedManagerId: null,
    reviewedById: null,
    deletedAt: null,
    deletedById: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function response(
  overrides: Partial<typeof aiFeedbackResponses.$inferSelect> = {}
): typeof aiFeedbackResponses.$inferSelect {
  return {
    id: "resp-1",
    sessionId: "session-1",
    criterionKey: "define.what_happened",
    section: "define",
    aiStatus: "met",
    aiReasoning: "Clear description.",
    criteriaEvaluationAgreement: null,
    reasoningAgreement: null,
    humanComment: "",
    suggestedStatus: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("buildImproveAiSessionView", () => {
  beforeEach(() => {
    vi.mocked(getCustomerPack).mockReturnValue(DEMO_PACK);
  });

  it("builds investigation sections from DMAIC content and responses", () => {
    const view = buildImproveAiSessionView({
      session: session(),
      report: report(),
      sectionContents: { define: { narrative } },
      responses: [response()],
    });

    expect(view.sections).toHaveLength(1);
    expect(view.sections[0]?.section).toBe("define");
    expect(view.totalCriterionCount).toBe(1);
  });

  it("returns an empty view instead of null when no matching criteria exist", () => {
    const view = buildImproveAiSessionView({
      session: session(),
      report: report({ documentType: "design_verification" }),
      sectionContents: { purpose_scope: { narrative } },
      responses: [],
    });

    expect(view.sections).toEqual([]);
    expect(view.id).toBe("session-1");
  });

  it("builds demo design-verification sections from purpose_scope", () => {
    const view = buildImproveAiSessionView({
      session: session(),
      report: report({ documentType: "design_verification" }),
      sectionContents: { purpose_scope: { narrative } },
      responses: [
        response({
          criterionKey: "purpose.objective",
          section: "purpose_scope",
        }),
      ],
    });

    expect(view.sections).toHaveLength(1);
    expect(view.sections[0]?.section).toBe("purpose_scope");
    expect(view.sections[0]?.criteria[0]?.criterionKey).toBe("purpose.objective");
  });

  it("builds Convergent design-verification sections so Review is not empty", () => {
    vi.mocked(getCustomerPack).mockReturnValue(CONVERGENT_PACK);

    const view = buildImproveAiSessionView({
      session: session(),
      report: report({ documentType: "design_verification" }),
      sectionContents: { purpose: { narrative } },
      responses: [
        response({
          criterionKey: "purpose.objective",
          section: "purpose",
        }),
      ],
    });

    expect(view.sections).toHaveLength(1);
    expect(view.sections[0]?.section).toBe("purpose");
    expect(view.totalCriterionCount).toBeGreaterThan(0);
  });
});
