import { describe, expect, it } from "vitest";
import { REV_U_REPORT_ONLY_REQ_IDS } from "@/lib/document-types/convergent/rev-u-report-only-req-ids";
import {
  buildReviewBatches,
  chatStepBudget,
  DocumentReviewSession,
  extractReviewFindingsFromPages,
  pickPlanModeChatTools,
  PLAN_MODE_CHAT_TOOL_NAMES,
  prepareDocumentReviewStep,
  REVIEW_EXTRACT_CONCURRENCY,
  shouldStopChatSteps,
  type ReviewPageSource,
} from "./document-review";

function page(
  pageNumber: number,
  transcript: string,
  attachmentId = "att_b"
): ReviewPageSource {
  return {
    attachmentId,
    filename: "Appendix-B.pdf",
    pageNumber,
    transcript,
    pageContext: null,
    printedPageLabel: String(pageNumber),
  };
}

const FAMILIES = {
  SST: "SW-SST-1 Soft tissue test Config: 1.0 W Pass",
  SIB: "SW-SIB-2 Safety interlock Config: armed Pass",
  LWB: "SW-LWB-4 Laser wavelength bandwidth Expected 10.6 Fail",
  LCB: "SW-LCB-1 Laser control board Run A Pass",
  SDT: "SW-SDT-3 Shut-down timer Config: 30s Pass",
} as const;

function appendixBPages(): ReviewPageSource[] {
  const families = Object.values(FAMILIES);
  return Array.from({ length: 62 }, (_, index) => {
    const pageNumber = index + 1;
    if (pageNumber === 1) {
      return page(pageNumber, "CONVERGENT DENTAL\nCover sheet\nPage 1");
    }
    const family = families[(pageNumber - 2) % families.length]!;
    return page(
      pageNumber,
      `TABLE 4 SOFTWARE REQUIREMENTS\n${family} execution ${pageNumber}`
    );
  });
}

describe("extractReviewFindingsFromPages", () => {
  it("keeps repeated executions as separate findings", () => {
    const findings = extractReviewFindingsFromPages([
      page(10, "SW-SST-1 Config: 1.0 W Pass"),
      page(11, "SW-SST-1 Config: 2.0 W Pass"),
    ]);
    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => finding.configuration).join(" ")).toMatch(
      /1\.0 W/
    );
    expect(findings.map((finding) => finding.configuration).join(" ")).toMatch(
      /2\.0 W/
    );
  });

  it("preserves dotted requirement IDs and ignores junk tokens", () => {
    const findings = extractReviewFindingsFromPages([
      page(
        4,
        "REQUIREMENTS VERIFIED\nSW-IN-1.1 SW-SST-5.1.1 Wesley Harrington PCON SW-SST-"
      ),
    ]);
    const ids = findings.flatMap((finding) => finding.identifiers);
    expect(ids).toEqual(expect.arrayContaining(["SW-IN-1.1", "SW-SST-5.1.1"]));
    expect(ids).not.toContain("PCON");
    expect(ids).not.toContain("SW-SST-");
  });
});

describe("buildReviewBatches", () => {
  it("isolates dense pages and retries them alone", () => {
    const dense = page(4, "x".repeat(7_000) + " SW-LWB-4 Pass");
    const batches = buildReviewBatches([
      page(1, "SW-SST-1 short"),
      page(2, "SW-SIB-1 short"),
      dense,
      page(5, "SW-LCB-1 short"),
    ]);
    expect(batches.some((batch) => batch.length === 1 && batch[0] === dense)).toBe(
      true
    );
  });
});

describe("DocumentReviewSession", () => {
  it("covers 62 pages and harvests every test family", async () => {
    const session = new DocumentReviewSession({
      extractBatch: async ({ pages }) => extractReviewFindingsFromPages(pages),
    });
    const started = session.start({
      objective: "requirements and results table",
      pages: appendixBPages(),
    });
    expect(started.status).toBe("started");
    expect(started.totalPages).toBe(62);

    const continued = await session.continue();
    expect(continued.status).toBe("ready_to_finish");
    expect(session.phase()).toBe("ready_to_finish");
    const finished = session.finish();
    expect(finished.status).toBe("complete");
    expect(finished.reviewedPages).toBe(62);
    expect(finished.coverageComplete).toBe(true);
    for (const id of ["SW-SST-1", "SW-SIB-2", "SW-LWB-4", "SW-LCB-1", "SW-SDT-3"]) {
      expect(finished.identifiers).toContain(id);
    }
  });

  it("retries a failed multi-page batch as smaller batches", async () => {
    let calls = 0;
    const session = new DocumentReviewSession({
      extractBatch: async ({ pages }) => {
        calls += 1;
        if (calls === 1 && pages.length > 1) {
          throw new Error("truncated");
        }
        return extractReviewFindingsFromPages(pages);
      },
    });
    session.start({
      objective: "ids",
      pages: [page(1, "SW-SST-1 Pass"), page(2, "SW-SIB-1 Pass"), page(3, "SW-LWB-1 Pass")],
    });
    await session.continue();
    while (session.phase() === "in_progress") {
      await session.continue();
    }
    const finished = session.finish();
    expect(finished.reviewedPages).toBe(3);
    expect(finished.identifiers).toEqual(
      expect.arrayContaining(["SW-SST-1", "SW-SIB-1", "SW-LWB-1"])
    );
    expect(calls).toBeGreaterThan(1);
  });

  it("keeps failed pages visible and refuses completeness", async () => {
    const session = new DocumentReviewSession({
      extractBatch: async ({ pages }) => {
        if (pages.some((item) => item.pageNumber === 2)) {
          throw new Error("vision failed");
        }
        return extractReviewFindingsFromPages(pages);
      },
    });
    session.start({
      objective: "ids",
      pages: [page(1, "SW-SST-1 Pass"), page(2, "SW-SIB-1 Pass")],
    });
    while (session.phase() === "in_progress") {
      await session.continue();
    }
    const finished = session.finish();
    expect(finished.coverageComplete).toBe(false);
    expect(finished.failedPages.map((item) => item.pageNumber)).toContain(2);
    expect(finished.coverageSummary).toMatch(/do not claim completeness/i);
  });

  it("does not finish while batches remain", async () => {
    const session = new DocumentReviewSession({
      extractBatch: async ({ pages }) => extractReviewFindingsFromPages(pages),
    });
    session.start({
      objective: "ids",
      pages: [page(1, "SW-SST-1 Pass"), page(2, "SW-SIB-1 Pass")],
    });
    const early = session.finish();
    expect(early.status).toBe("incomplete");
    expect(session.isFinished()).toBe(false);
  });

  it("extracts remaining batches in parallel in one continue", async () => {
    let inflight = 0;
    let maxInflight = 0;
    let calls = 0;
    const session = new DocumentReviewSession({
      extractBatch: async ({ pages }) => {
        calls += 1;
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inflight -= 1;
        return extractReviewFindingsFromPages(pages);
      },
    });
    const manyPages = Array.from({ length: 24 }, (_, index) =>
      page(index + 1, `${"x".repeat(7_000)} SW-SST-${index + 1} Pass`)
    );
    session.start({ objective: "ids", pages: manyPages });
    const first = await session.continue();
    expect(first.status).toBe("ready_to_finish");
    expect(first.reviewedPages).toBe(24);
    expect(calls).toBe(24);
    expect(maxInflight).toBe(REVIEW_EXTRACT_CONCURRENCY);
  });

  it("recommends the 14-row Requirements Verified inventory, not protocol mentions", async () => {
    const session = new DocumentReviewSession({
      extractBatch: async ({ pages }) => extractReviewFindingsFromPages(pages),
    });
    const verifiedRows = REV_U_REPORT_ONLY_REQ_IDS.map(
      (id) => `${id} Upgrade installation method A Pass`
    ).join("\n");
    session.start({
      objective: "results matrix",
      pages: [
        page(
          4,
          `REQUIREMENTS VERIFIED\nReq ID Req Description Satisfied By P/F\n${verifiedRows}`
        ),
        page(
          31,
          "TABLE 4 SOFTWARE REQUIREMENTS\nSW-SS-1 SW-AR-3 SW-SST-1 listed in the protocol body"
        ),
      ],
    });
    while (session.phase() === "in_progress") {
      await session.continue();
    }
    const finished = session.finish();
    expect(finished.recommendedInventory.ids).toEqual([...REV_U_REPORT_ONLY_REQ_IDS]);
    expect(finished.recommendedInventory.sourceKind).toBe("verified_table");
    expect(finished.recommendedInventory.confidence).toBe("high");
    expect(finished.allIdentifiers).toEqual(
      expect.arrayContaining([...REV_U_REPORT_ONLY_REQ_IDS, "SW-SS-1", "SW-AR-3"])
    );
    expect(finished.allIdentifiers.length).toBeGreaterThan(14);
    expect(finished.identifiers).toEqual(finished.allIdentifiers);
  });
});

describe("prepareDocumentReviewStep", () => {
  const available = [
    "start_document_review",
    "continue_document_review",
    "finish_document_review",
    "draft_field",
    "search_documents",
    "ask_user",
  ];

  it("hides page-walk tools on focused and adaptive turns until a review starts", () => {
    const focused = prepareDocumentReviewStep({
      policy: "focused",
      phase: "idle",
      availableTools: available,
    });
    expect(focused?.activeTools).not.toContain("start_document_review");
    expect(focused?.activeTools).toContain("search_documents");

    const adaptive = prepareDocumentReviewStep({
      policy: "adaptive",
      phase: "idle",
      availableTools: available,
    });
    expect(adaptive?.activeTools).not.toContain("start_document_review");
    expect(adaptive?.activeTools).not.toContain("continue_document_review");
    expect(adaptive?.activeTools).toContain("search_documents");
  });

  it("locks an in-progress review even on adaptive turns", () => {
    expect(
      prepareDocumentReviewStep({
        policy: "adaptive",
        phase: "in_progress",
        availableTools: available,
      })
    ).toEqual({
      activeTools: ["continue_document_review"],
      toolChoice: { type: "tool", toolName: "continue_document_review" },
    });
  });

  it("forces continue until finish, then unlocks drafting", () => {
    expect(
      prepareDocumentReviewStep({
        policy: "comprehensive",
        phase: "idle",
        availableTools: available,
      })
    ).toEqual({
      activeTools: ["start_document_review"],
      toolChoice: { type: "tool", toolName: "start_document_review" },
    });
    expect(
      prepareDocumentReviewStep({
        policy: "comprehensive",
        phase: "idle",
        availableTools: available,
      })?.activeTools
    ).not.toContain("draft_field");

    expect(
      prepareDocumentReviewStep({
        policy: "comprehensive",
        phase: "in_progress",
        availableTools: available,
      })
    ).toEqual({
      activeTools: ["continue_document_review"],
      toolChoice: { type: "tool", toolName: "continue_document_review" },
    });

    expect(
      prepareDocumentReviewStep({
        policy: "comprehensive",
        phase: "ready_to_finish",
        availableTools: available,
      })?.toolChoice
    ).toEqual({ type: "tool", toolName: "finish_document_review" });

    expect(
      prepareDocumentReviewStep({
        policy: "comprehensive",
        phase: "complete",
        availableTools: available,
      })
    ).toBeUndefined();
  });
});

describe("chatStepBudget", () => {
  it("keeps focused turns on the existing small budget", () => {
    expect(
      chatStepBudget({ mode: "plan", policy: "focused", totalPages: 62 })
    ).toBe(8);
    expect(
      chatStepBudget({ mode: "agent", policy: "focused", totalPages: 62 })
    ).toBe(24);
  });

  it("gives adaptive turns room for complementary search", () => {
    expect(
      chatStepBudget({ mode: "plan", policy: "adaptive", totalPages: 62 })
    ).toBe(16);
    expect(
      chatStepBudget({ mode: "agent", policy: "adaptive", totalPages: 62 })
    ).toBe(40);
  });

  it("raises the comprehensive budget from page count", () => {
    const budget = chatStepBudget({
      mode: "agent",
      policy: "comprehensive",
      totalPages: 62,
    });
    expect(budget).toBeGreaterThan(24);
    expect(budget).toBeLessThanOrEqual(96);
  });

  it("raises the budget once a page walk is in progress", () => {
    expect(
      shouldStopChatSteps({
        stepsTaken: 16,
        mode: "plan",
        policy: "adaptive",
        reviewPhase: "idle",
        totalPages: 62,
      })
    ).toBe(true);
    expect(
      shouldStopChatSteps({
        stepsTaken: 16,
        mode: "plan",
        policy: "adaptive",
        reviewPhase: "in_progress",
        totalPages: 62,
      })
    ).toBe(false);
  });
});

describe("pickPlanModeChatTools", () => {
  it("keeps document-review tools on the Plan-mode allowlist", () => {
    const allTools = {
      read_section: { kind: "read" },
      search_documents: { kind: "search" },
      read_document_page: { kind: "page" },
      document_outline: { kind: "outline" },
      start_document_review: { kind: "start" },
      continue_document_review: { kind: "continue" },
      finish_document_review: { kind: "finish" },
      ask_user: { kind: "ask" },
      draft_field: { kind: "draft" },
      propose_edit: { kind: "edit" },
    };
    const planTools = pickPlanModeChatTools(allTools);
    expect(PLAN_MODE_CHAT_TOOL_NAMES).toEqual(
      expect.arrayContaining([
        "start_document_review",
        "continue_document_review",
        "finish_document_review",
        "document_outline",
        "ask_user",
      ])
    );
    expect(planTools).toMatchObject({
      start_document_review: { kind: "start" },
      continue_document_review: { kind: "continue" },
      finish_document_review: { kind: "finish" },
    });
    expect(planTools).not.toHaveProperty("draft_field");
    expect(planTools).not.toHaveProperty("propose_edit");
  });
});
