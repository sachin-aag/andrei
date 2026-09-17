import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/usage", () => ({
  assertAiBudgetAvailable: vi.fn().mockResolvedValue(undefined),
  recordAiUsage: vi.fn().mockResolvedValue(undefined),
}));

import { REV_U_REPORT_ONLY_REQ_IDS } from "@/lib/document-types/convergent/rev-u-report-only-req-ids";
import {
  buildReviewBatches,
  DocumentReviewSession,
  documentReviewCoverageKey,
  extractReviewFindingsFromPages,
  interleaveReviewBatchesByAttachment,
  pickPlanModeChatTools,
  PLAN_MODE_CHAT_TOOL_NAMES,
  prepareDocumentReviewStep,
  REVIEW_ALREADY_COMPLETE_MESSAGE,
  REVIEW_EXTRACT_CONCURRENCY,
  REVIEW_FINISH_FINDINGS_CAP,
  reviewBatchNeedsLlmExtract,
  reviewContinueBudgetMs,
  selectReviewPages,
  capFindingsForFinish,
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

  it("does not mix attachments in one batch", () => {
    const batches = buildReviewBatches([
      page(1, "SW-SST-1 short", "att_a"),
      page(2, "SW-SIB-1 short", "att_b"),
    ]);
    expect(batches).toHaveLength(2);
    expect(batches[0]?.[0]?.attachmentId).toBe("att_a");
    expect(batches[1]?.[0]?.attachmentId).toBe("att_b");
  });
});

describe("interleaveReviewBatchesByAttachment", () => {
  it("round-robins batches so one file cannot occupy every slot", () => {
    const interleaved = interleaveReviewBatchesByAttachment([
      [page(1, "a1", "att_a"), page(2, "a2", "att_a")],
      [page(3, "a3", "att_a")],
      [page(1, "b1", "att_b")],
      [page(2, "b2", "att_b")],
    ]);
    expect(interleaved.map((batch) => batch[0]?.attachmentId)).toEqual([
      "att_a",
      "att_b",
      "att_a",
      "att_b",
    ]);
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
    expect(started.totalPages).toBe(61);

    const continued = await session.continue();
    expect(continued.status).toBe("ready_to_finish");
    expect(session.phase()).toBe("ready_to_finish");
    const finished = session.finish();
    expect(finished.status).toBe("complete");
    expect(finished.truncated).toBe(false);
    expect(finished.reviewedPages).toBe(61);
    expect(finished.reviewedEvidence).toHaveLength(61);
    expect(finished.reviewedEvidence[0]).toMatchObject({
      attachmentId: expect.any(String),
      filename: expect.any(String),
      pageNumber: expect.any(Number),
    });
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
    expect(finished.truncated).toBe(true);
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
      page(index + 1, `SW-SST-${index + 1} Pass ${"x".repeat(7_000)}`)
    );
    session.start({ objective: "SW-SST", pages: manyPages });
    const first = await session.continue();
    expect(first.status).toBe("ready_to_finish");
    expect(first.reviewedPages).toBe(24);
    expect(calls).toBe(24);
    expect(maxInflight).toBe(REVIEW_EXTRACT_CONCURRENCY);
  });

  it("skips the extract LLM when every page already has a transcript", () => {
    expect(
      reviewBatchNeedsLlmExtract([
        page(1, `${"x".repeat(200)} SW-SST-1 Pass`),
        page(2, `${"y".repeat(200)} SW-SIB-1 Pass`),
      ])
    ).toBe(false);
    expect(
      reviewBatchNeedsLlmExtract([page(1, "short OCR miss")])
    ).toBe(true);
  });

  it("stops draining when the turn abort fires and leaves remaining batches", async () => {
    const abort = new AbortController();
    let calls = 0;
    const session = new DocumentReviewSession({
      extractBatch: async ({ pages }) => {
        calls += 1;
        if (calls === 2) abort.abort();
        await new Promise((resolve) => setTimeout(resolve, 15));
        return extractReviewFindingsFromPages(pages);
      },
    });
    const manyPages = Array.from({ length: 24 }, (_, index) =>
      page(index + 1, `SW-SST-${index + 1} Pass ${"x".repeat(7_000)}`)
    );
    session.start({ objective: "SW-SST", pages: manyPages });
    const first = await session.continue({ abortSignal: abort.signal });
    expect(first.status).toBe("in_progress");
    expect(first.remainingBatches).toBeGreaterThan(0);
    expect(first.reviewedPages).toBeLessThan(24);
    expect(calls).toBeLessThan(24);
  });

  it("stops starting batches when the continue budget is exhausted", async () => {
    const session = new DocumentReviewSession({
      extractBatch: async ({ pages }) => extractReviewFindingsFromPages(pages),
    });
    const manyPages = Array.from({ length: 24 }, (_, index) =>
      page(index + 1, `SW-SST-${index + 1} Pass ${"x".repeat(7_000)}`)
    );
    session.start({ objective: "SW-SST", pages: manyPages });
    const first = await session.continue({ budgetMs: 0 });
    expect(first.status).toBe("in_progress");
    expect(first.budgetExhausted).toBe(true);
    expect(first.remainingBatches).toBeGreaterThan(0);
    expect(first.reviewedPages).toBe(0);
    expect(first.byAttachment.length).toBeGreaterThan(0);
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
    ).toEqual({
      activeTools: ["draft_field", "search_documents", "ask_user"],
    });
  });

  it("forces start on adaptive idle when an empty inventory still needs a matching review", () => {
    expect(
      prepareDocumentReviewStep({
        policy: "adaptive",
        phase: "idle",
        availableTools: available,
        requireInventoryReview: true,
      })
    ).toEqual({
      activeTools: ["start_document_review"],
      toolChoice: { type: "tool", toolName: "start_document_review" },
    });
  });

  it("restarts from complete when the finished walk does not cover this inventory", () => {
    expect(
      prepareDocumentReviewStep({
        policy: "adaptive",
        phase: "complete",
        availableTools: available,
        requireInventoryReview: true,
      })
    ).toEqual({
      activeTools: ["start_document_review"],
      toolChoice: { type: "tool", toolName: "start_document_review" },
    });
  });

  it("hides review tools after a matching finish so drafting can run", () => {
    expect(
      prepareDocumentReviewStep({
        policy: "adaptive",
        phase: "complete",
        availableTools: available,
        requireInventoryReview: false,
      })?.activeTools
    ).toEqual(["draft_field", "search_documents", "ask_user"]);
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
      insert_image: { kind: "image" },
      plot_measurements: { kind: "chart" },
      remove_image: { kind: "image-remove" },
      edit_table: { kind: "table" },
    };
    const planTools = pickPlanModeChatTools(allTools);
    expect(PLAN_MODE_CHAT_TOOL_NAMES).toEqual(
      expect.arrayContaining([
        "start_document_review",
        "continue_document_review",
        "finish_document_review",
        "document_outline",
        "list_attachments",
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
    expect(planTools).not.toHaveProperty("insert_image");
    expect(planTools).not.toHaveProperty("plot_measurements");
    expect(planTools).not.toHaveProperty("remove_image");
    expect(planTools).not.toHaveProperty("edit_table");
  });
});

describe("capFindingsForFinish", () => {
  it("keeps a short list unchanged", () => {
    const findings = [
      {
        id: "d1",
        attachmentId: "att_b",
        filename: "Appendix-B.pdf",
        pageNumber: 1,
        identifiers: ["SW-SST-1"],
        heading: null,
        summary: "pass",
        configuration: null,
        result: "Pass",
      },
    ];
    expect(capFindingsForFinish(findings)).toEqual({
      findings,
      omitted: 0,
    });
  });

  it("caps a long catalog sample and reports omitted count", () => {
    const findings = Array.from({ length: REVIEW_FINISH_FINDINGS_CAP + 17 }, (_, i) => ({
      id: `d${i + 1}`,
      attachmentId: "att_b",
      filename: "Appendix-B.pdf",
      pageNumber: i + 1,
      identifiers: [`ID-${i + 1}`],
      heading: null,
      summary: "row",
      configuration: null,
      result: null,
    }));
    const capped = capFindingsForFinish(findings);
    expect(capped.findings).toHaveLength(REVIEW_FINISH_FINDINGS_CAP);
    expect(capped.omitted).toBe(17);
    expect(capped.findings[0]?.id).toBe("d1");
  });
});

describe("reviewContinueBudgetMs", () => {
  it("caps at 60s and leaves abort margin", () => {
    expect(reviewContinueBudgetMs(270_000)).toBe(60_000);
    expect(reviewContinueBudgetMs(70_000)).toBe(50_000);
  });

  it("returns 0 when the abort window cannot fit another continue", () => {
    expect(reviewContinueBudgetMs(5_000)).toBe(0);
    expect(reviewContinueBudgetMs(20_000)).toBe(0);
    expect(reviewContinueBudgetMs(21_000)).toBe(1_000);
  });
});

describe("selectReviewPages", () => {
  it("round-robins so an earlier attachment cannot consume the cap", () => {
    const pages = [
      ...Array.from({ length: 280 }, (_, i) =>
        page(i + 1, `early ${i + 1}`, "att_a")
      ),
      ...Array.from({ length: 80 }, (_, i) =>
        page(i + 1, `later ${i + 1}`, "att_b")
      ),
    ];
    // Binding test cap — not a walk-size limit. Production listing uses REVIEW_PAGE_FETCH_CAP.
    const selected = selectReviewPages(pages, 300);
    expect(selected).toHaveLength(300);
    const byAttachment = selected.reduce<Record<string, number>>((acc, row) => {
      acc[row.attachmentId] = (acc[row.attachmentId] ?? 0) + 1;
      return acc;
    }, {});
    expect(byAttachment.att_a).toBe(220);
    expect(byAttachment.att_b).toBe(80);
  });
});

describe("DocumentReviewSession coverage identity", () => {
  it("uses the selected documents' full page counts for the coverage key", async () => {
    const session = new DocumentReviewSession({
      extractBatch: async ({ pages }) => extractReviewFindingsFromPages(pages),
    });
    session.start({
      objective: "ids",
      pages: [page(1, "SW-SST-1 Pass", "att_a")],
      coverageSources: [
        { attachmentId: "att_a", pageCount: 400, ingestRunId: "run" },
        { attachmentId: "att_b", pageCount: 80, ingestRunId: "run" },
      ],
    });
    await session.continue();
    const finished = session.finish();
    expect(finished.status).toBe("complete");
    expect(finished.truncated).toBe(true);
    expect(finished.coverageComplete).toBe(false);
    expect(finished.skippedAttachmentIds).toEqual(["att_b"]);
    expect(finished.coverageKey).toContain("att_a:400:");
    expect(finished.coverageKey).toContain("att_b:80:");
    expect(finished.coverageKey).toContain("|obj:ids");
    expect(finished.coverageKey).toContain("|skip:att_b");
    expect(session.inventoryFinishSatisfiesDraft()).toBe(false);
  });

  it("refuses a second start for the same inventory after finish", async () => {
    const session = new DocumentReviewSession({
      extractBatch: async ({ pages }) => extractReviewFindingsFromPages(pages),
    });
    const sources = [
      { attachmentId: "att_a", pageCount: 1, ingestRunId: "run" },
    ];
    session.start({
      objective: "monitoring parameters",
      pages: [page(1, "non-viable viable particle Pass", "att_a")],
      coverageSources: sources,
      coverageObjective: "elr_monitoring",
    });
    await session.continue();
    expect(session.finish().status).toBe("complete");

    const again = session.start({
      objective: "extract sampling connections and ports",
      pages: [page(1, "non-viable viable particle Pass", "att_a")],
      coverageSources: sources,
      coverageObjective: "elr_monitoring",
    });
    expect(again).toMatchObject({
      status: "already_complete",
      message: REVIEW_ALREADY_COMPLETE_MESSAGE,
    });
    expect(session.phase()).toBe("complete");
    expect(session.inventoryFinishSatisfiesDraft()).toBe(true);
  });

  it("allows a second start after a floor-8 skip of the PRQR", async () => {
    const session = new DocumentReviewSession({
      extractBatch: async ({ pages }) => extractReviewFindingsFromPages(pages),
    });
    const csvPage = {
      ...page(1, "connections for environmental monitoring systems", "csv"),
      filename: "CSV-OQ-PR-055 PART-1.pdf",
    };
    const prqrPage = {
      ...page(40, "Non-Viable Particulate Monitoring Settle Plate", "prqr"),
      filename: "PRQR-25-PR-005 Report.pdf",
    };
    session.start({
      objective: "monitoring parameters",
      pages: [csvPage],
      coverageSources: [
        { attachmentId: "csv", pageCount: 8, ingestRunId: "run" },
        { attachmentId: "prqr", pageCount: 357, ingestRunId: "run" },
      ],
      coverageObjective: "elr_monitoring",
    });
    await session.continue();
    const finished = session.finish();
    expect(finished.truncated).toBe(true);
    expect(finished.skippedAttachmentIds).toEqual(["prqr"]);
    expect(session.inventoryFinishSatisfiesDraft()).toBe(false);

    const again = session.start({
      objective: "monitoring parameters",
      pages: [csvPage, prqrPage],
      coverageSources: [
        { attachmentId: "csv", pageCount: 8, ingestRunId: "run" },
        { attachmentId: "prqr", pageCount: 357, ingestRunId: "run" },
      ],
      coverageObjective: "elr_monitoring",
    });
    expect(again.status).toBe("started");
  });

  it("starts a new walk when complete coverage is a different inventory", async () => {
    const session = new DocumentReviewSession({
      extractBatch: async ({ pages }) => extractReviewFindingsFromPages(pages),
    });
    const sources = [
      { attachmentId: "att_a", pageCount: 1, ingestRunId: "run" },
    ];
    session.start({
      objective: "calibration certificates",
      pages: [page(1, "certificate Pass", "att_a")],
      coverageSources: sources,
      coverageObjective: "elr_calibration",
    });
    await session.continue();
    expect(session.finish().status).toBe("complete");

    const next = session.start({
      objective: "monitoring parameters",
      pages: [page(1, "non-viable viable particle Pass", "att_a")],
      coverageSources: sources,
      coverageObjective: "elr_monitoring",
    });
    expect(next.status).toBe("started");
    expect(session.phase()).toBe("in_progress");
  });

  it("does not reuse a finished walk when the coverage objective changes", () => {
    const sources = [
      { attachmentId: "att_a", pageCount: 10, ingestRunId: "run" },
    ];
    expect(documentReviewCoverageKey(sources, "elr_calibration")).not.toBe(
      documentReviewCoverageKey(sources, "elr_monitoring")
    );
  });

  it("queues more than 300 pages when the set is under the fetch cap", () => {
    const session = new DocumentReviewSession({
      extractBatch: async ({ pages }) => extractReviewFindingsFromPages(pages),
    });
    const pages = Array.from({ length: 350 }, (_, i) =>
      page(i + 1, `inventory ${i + 1}`, "att_a")
    );
    const started = session.start({
      objective: "inventory",
      pages,
      coverageSources: [
        { attachmentId: "att_a", pageCount: 350, ingestRunId: "run" },
      ],
    });
    expect(started.status).toBe("started");
    expect(started.totalPages).toBe(350);
  });
});
