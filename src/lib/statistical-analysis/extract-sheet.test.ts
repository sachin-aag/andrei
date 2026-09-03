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
  sheetExtractResultFromSteps,
  withSheetExtractSlot,
} from "./extract-sheet";
import {
  analyticsSheetJobComplete,
  type AnalyticsChatStep,
} from "./search-loop";

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
