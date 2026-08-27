import { describe, expect, it } from "vitest";
import {
  ANALYTICS_CHAT_STEP_BUDGET,
  analyticsSearchLoopDirective,
  prepareAnalyticsChatStep,
  type AnalyticsChatStep,
} from "./search-loop";

function step(
  names: string[],
  searchHits?: number
): AnalyticsChatStep {
  const toolCalls = names.map((toolName) => ({ toolName }));
  if (searchHits === undefined) {
    return { toolCalls };
  }
  return {
    toolCalls,
    toolResults: names
      .filter((toolName) => toolName === "search_documents")
      .map((toolName) => ({
        toolName,
        output: { returnedCount: searchHits, seenPages: [] },
      })),
  };
}

describe("analyticsSearchLoopDirective", () => {
  it("lets the first empty grep through and hides search after two empties", () => {
    expect(analyticsSearchLoopDirective([step(["search_documents"], 0)])).toBe(
      "continue"
    );
    expect(
      analyticsSearchLoopDirective([
        step(["search_documents"], 0),
        step(["search_documents"], 0),
      ])
    ).toBe("read");
  });

  it("hides search as soon as a grep returns a cited page", () => {
    expect(analyticsSearchLoopDirective([step(["search_documents"], 3)])).toBe(
      "read"
    );
  });

  it("hides search after a page read, scan, outline, or extract", () => {
    expect(
      analyticsSearchLoopDirective([step(["read_document_page"])])
    ).toBe("read");
    expect(analyticsSearchLoopDirective([step(["scan_attachments"])])).toBe(
      "read"
    );
    expect(analyticsSearchLoopDirective([step(["document_outline"])])).toBe(
      "read"
    );
    expect(
      analyticsSearchLoopDirective([step(["extract_numeric_series"])])
    ).toBe("read");
  });

  it("does not treat read_worksheet as progress that unlocks more greps", () => {
    expect(
      analyticsSearchLoopDirective([
        step(["search_documents"], 0),
        step(["read_worksheet"]),
        step(["search_documents"], 0),
      ])
    ).toBe("read");
  });

  it("hides search after a mixed search-and-read step", () => {
    expect(
      analyticsSearchLoopDirective([
        step(["search_documents", "read_document_page"], 0),
      ])
    ).toBe("read");
  });
});

describe("prepareAnalyticsChatStep", () => {
  it("hides search after two empty greps and keeps write tools when editable", () => {
    const prepared = prepareAnalyticsChatStep({
      steps: [step(["search_documents"], 0), step(["search_documents"], 0)],
      canEdit: true,
    });
    expect(prepared?.activeTools).toContain("read_document_page");
    expect(prepared?.activeTools).toContain("document_outline");
    expect(prepared?.activeTools).toContain("scan_attachments");
    expect(prepared?.activeTools).toContain("write_column");
    expect(prepared?.activeTools).toContain("manage_worksheet");
    expect(prepared?.activeTools).toContain("run_one_way_anova");
    expect(prepared?.activeTools).toContain("plot_measurements");
    expect(prepared?.activeTools).toContain("plot_xy_scatter");
    expect(prepared?.activeTools).not.toContain("search_documents");
    expect(
      prepareAnalyticsChatStep({
        steps: [step(["search_documents"], 0), step(["search_documents"], 0)],
        canEdit: false,
      })?.activeTools
    ).not.toContain("write_column");
  });

  it("does not hide search on the first empty grep", () => {
    expect(
      prepareAnalyticsChatStep({
        steps: [step(["search_documents"], 0)],
        canEdit: true,
      })
    ).toBeUndefined();
  });

  it("hides search after the first grep that returns pages", () => {
    const prepared = prepareAnalyticsChatStep({
      steps: [step(["search_documents"], 2)],
      canEdit: true,
    });
    expect(prepared?.activeTools).not.toContain("search_documents");
    expect(prepared?.activeTools).toContain("extract_numeric_series");
  });

  it("strips tools on the last budgeted step so the model must write", () => {
    const steps = Array.from({ length: ANALYTICS_CHAT_STEP_BUDGET - 1 }, () =>
      step(["read_worksheet"])
    );
    expect(
      prepareAnalyticsChatStep({ steps, canEdit: true })?.activeTools
    ).toEqual([]);
  });
});
