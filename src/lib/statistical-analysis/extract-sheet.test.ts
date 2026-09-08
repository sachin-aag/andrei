import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/attachments/retrieval", () => ({
  listReadyDocumentsForReport: vi.fn(async () => []),
}));
vi.mock("@/lib/ai/usage", () => ({
  assertAiBudgetAvailable: vi.fn(),
  recordAiUsage: vi.fn(),
}));
import {
  EXTRACT_SHEET_CONCURRENCY,
  SHEET_EXTRACT_MIN_START_MS,
  buildSheetWorkerPrompt,
  sheetExtractResultFromSteps,
  sheetExtractShouldSkipStart,
  withSheetExtractSlot,
} from "./extract-sheet";
import { CHAT_SERVER_ABORT_MS } from "@/lib/ai/chat/assistant-turn";
import {
  analyticsSheetJobComplete,
  type AnalyticsChatStep,
} from "./search-loop";

function extractStep(output: Record<string, unknown>): AnalyticsChatStep {
  return {
    toolCalls: [{ toolName: "extract_numeric_series" }],
    toolResults: [{ toolName: "extract_numeric_series", output }],
  };
}

function scanStep(output: Record<string, unknown>): AnalyticsChatStep {
  return {
    toolCalls: [{ toolName: "scan_attachments" }],
    toolResults: [{ toolName: "scan_attachments", output }],
  };
}

function writeStep(output: Record<string, unknown>): AnalyticsChatStep {
  return {
    toolCalls: [{ toolName: "write_column" }],
    toolResults: [{ toolName: "write_column", output }],
  };
}

describe("sheetExtractResultFromSteps", () => {
  it("reads the last complete write_column", () => {
    const result = sheetExtractResultFromSteps(
      [
        writeStep({
          status: "incomplete",
          incomplete: true,
          sheetName: "Power",
          rowsWritten: 0,
        }),
        writeStep({
          status: "written",
          incomplete: false,
          sheetId: "data-2",
          sheetName: "Power",
          rowsWritten: 12,
          columns: [{ columnName: "Watts", rowsWritten: 12 }],
        }),
      ],
      "Power"
    );
    expect(result).toMatchObject({
      status: "written",
      sheetId: "data-2",
      sheetName: "Power",
      rowsWritten: 12,
      columns: [{ name: "Watts", rowsWritten: 12 }],
    });
    expect(result?.message).toBe("Wrote 12 rows to Power.");
    expect(result?.morePages).toBeUndefined();
    expect(result?.truncated).toBeUndefined();
  });

  it("keeps an incomplete write when that was the last dump", () => {
    const result = sheetExtractResultFromSteps(
      [
        writeStep({
          status: "incomplete",
          incomplete: true,
          message: "Blanked cells",
          sheetName: "Power",
        }),
      ],
      "Power"
    );
    expect(result).toMatchObject({
      status: "incomplete",
      sheetName: "Power",
      message: "Blanked cells",
    });
  });

  it("notes when a write landed after an extract still had more pages", () => {
    const result = sheetExtractResultFromSteps(
      [
        extractStep({ morePages: true, pages: [4, 5, 6] }),
        writeStep({
          status: "written",
          incomplete: false,
          sheetName: "Power",
          rowsWritten: 37,
        }),
      ],
      "Power"
    );
    expect(result?.status).toBe("written");
    expect(result?.morePages).toBe(true);
    expect(result?.message).toBe(
      "Wrote 37 rows to Power. Later pages still had more rows — this dump may be incomplete."
    );
  });

  it("clears the more-pages flag when a later extract finished the file", () => {
    const result = sheetExtractResultFromSteps(
      [
        extractStep({ morePages: true }),
        extractStep({ morePages: false }),
        writeStep({
          status: "written",
          incomplete: false,
          sheetName: "Power",
          rowsWritten: 37,
        }),
      ],
      "Power"
    );
    expect(result?.message).toBe("Wrote 37 rows to Power.");
    expect(result?.morePages).toBeUndefined();
  });

  it("notes when a write landed after a truncated scan", () => {
    const result = sheetExtractResultFromSteps(
      [
        scanStep({ truncated: true }),
        writeStep({
          status: "written",
          incomplete: false,
          sheetName: "Power",
          rowsWritten: 12,
        }),
      ],
      "Power"
    );
    expect(result?.truncated).toBe(true);
    expect(result?.message).toBe(
      "Wrote 12 rows to Power. The last scan was truncated — remaining pages were not included."
    );
  });
});

describe("analyticsSheetJobComplete", () => {
  it("is true after a complete write_column", () => {
    expect(
      analyticsSheetJobComplete([
        writeStep({
          status: "written",
          incomplete: false,
          rowsWritten: 12,
        }),
      ])
    ).toBe(true);
  });

  it("is false after an incomplete write", () => {
    expect(
      analyticsSheetJobComplete([
        writeStep({
          status: "incomplete",
          incomplete: true,
          rowsWritten: 0,
        }),
      ])
    ).toBe(false);
  });

  it("treats a successful row delete as complete on an edit job", () => {
    const steps: AnalyticsChatStep[] = [
      {
        toolCalls: [{ toolName: "manage_worksheet" }],
        toolResults: [
          {
            toolName: "manage_worksheet",
            output: {
              status: "ok",
              action: "delete_row",
              row: 12,
              rowEnd: 20,
              sheetName: "Power",
            },
          },
        ],
      },
    ];
    expect(analyticsSheetJobComplete(steps)).toBe(false);
    expect(
      analyticsSheetJobComplete(steps, { allowManageEdit: true })
    ).toBe(true);
  });
});

describe("sheetExtractResultFromSteps manage edits", () => {
  it("reads a successful delete_row as edited", () => {
    const result = sheetExtractResultFromSteps(
      [
        {
          toolCalls: [{ toolName: "manage_worksheet" }],
          toolResults: [
            {
              toolName: "manage_worksheet",
              output: {
                status: "ok",
                action: "delete_row",
                message: "Deleted rows 12–20 — check the worksheet",
                sheetId: "data-2",
                sheetName: "Power",
                row: 12,
                rowEnd: 20,
              },
            },
          ],
        },
      ],
      "Power"
    );
    expect(result).toMatchObject({
      status: "edited",
      sheetId: "data-2",
      sheetName: "Power",
      message: "Deleted rows 12–20 — check the worksheet",
    });
  });
});

describe("buildSheetWorkerPrompt", () => {
  it("tells an edit job to append or delete without replacing the sheet", () => {
    const prompt = buildSheetWorkerPrompt({
      reportId: "report-1",
      tools: {},
      sheetName: "Power",
      objective: "Remove rows 12–20 and add the missing tips from page 8",
      mode: "edit",
      sheetId: "data-2",
    });
    expect(prompt).toContain("You edit ONE existing worksheet sheet");
    expect(prompt).toContain("mode append");
    expect(prompt).toContain("rowEnd");
    expect(prompt).toContain("Do not use replace");
    expect(prompt).toContain("read_worksheet");
    expect(prompt).toContain("assigned sheet name as sheetId");
  });
});

describe("withSheetExtractSlot", () => {
  it("caps in-flight sheet jobs", async () => {
    let inflight = 0;
    let maxInflight = 0;
    const jobs = Array.from({ length: EXTRACT_SHEET_CONCURRENCY + 3 }, () =>
      withSheetExtractSlot(async () => {
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise((resolve) => setTimeout(resolve, 15));
        inflight -= 1;
      })
    );
    await Promise.all(jobs);
    expect(maxInflight).toBe(EXTRACT_SHEET_CONCURRENCY);
  });
});

describe("sheetExtractShouldSkipStart", () => {
  it("does not skip when the turn start is unknown", () => {
    expect(sheetExtractShouldSkipStart({})).toBe(false);
  });

  it("skips when the abort signal already fired", () => {
    const abort = new AbortController();
    abort.abort();
    expect(
      sheetExtractShouldSkipStart({
        turnStartedAtMs: 0,
        abortSignal: abort.signal,
        nowMs: 0,
      })
    ).toBe(true);
  });

  it("skips when less than 30s remain on the chat turn", () => {
    expect(
      sheetExtractShouldSkipStart({
        turnStartedAtMs: 0,
        nowMs: CHAT_SERVER_ABORT_MS - SHEET_EXTRACT_MIN_START_MS + 1,
      })
    ).toBe(true);
  });

  it("starts when at least 30s remain", () => {
    expect(
      sheetExtractShouldSkipStart({
        turnStartedAtMs: 0,
        nowMs: CHAT_SERVER_ABORT_MS - SHEET_EXTRACT_MIN_START_MS,
      })
    ).toBe(false);
  });
});
