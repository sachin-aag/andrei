import { describe, expect, it } from "vitest";
import {
  ANALYTICS_CHAT_STEP_BUDGET,
  analyticsSearchLoopDirective,
  prepareAnalyticsChatStep,
  type AnalyticsChatStep,
} from "./search-loop";

function step(names: string[]): AnalyticsChatStep {
  return {
    toolCalls: names.map((toolName) => ({ toolName })),
  };
}

describe("analyticsSearchLoopDirective", () => {
  it("lets the first two greps through", () => {
    expect(analyticsSearchLoopDirective([step(["search_documents"])])).toBe(
      "continue"
    );
    expect(
      analyticsSearchLoopDirective([
        step(["search_documents"]),
        step(["search_documents"]),
      ])
    ).toBe("read");
  });

  it("resets after a read so later complementary greps are allowed", () => {
    expect(
      analyticsSearchLoopDirective([
        step(["search_documents"]),
        step(["search_documents"]),
        step(["read_document_page"]),
        step(["search_documents"]),
      ])
    ).toBe("continue");
  });

  it("does not count a mixed search-and-read step as a loop", () => {
    expect(
      analyticsSearchLoopDirective([
        step(["search_documents", "read_document_page"]),
        step(["search_documents"]),
      ])
    ).toBe("continue");
  });
});

describe("prepareAnalyticsChatStep", () => {
  it("hides search after two search-only steps and keeps write tools when editable", () => {
    const prepared = prepareAnalyticsChatStep({
      steps: [step(["search_documents"]), step(["search_documents"])],
      canEdit: true,
    });
    expect(prepared?.activeTools).toContain("read_document_page");
    expect(prepared?.activeTools).toContain("document_outline");
    expect(prepared?.activeTools).toContain("scan_attachments");
    expect(prepared?.activeTools).toContain("write_column");
    expect(prepared?.activeTools).toContain("manage_worksheet");
    expect(prepared?.activeTools).toContain("plot_measurements");
    expect(prepared?.activeTools).not.toContain("search_documents");
    expect(
      prepareAnalyticsChatStep({
        steps: [step(["search_documents"]), step(["search_documents"])],
        canEdit: false,
      })?.activeTools
    ).not.toContain("write_column");
  });

  it("does not hide search on the first grep", () => {
    expect(
      prepareAnalyticsChatStep({
        steps: [step(["search_documents"])],
        canEdit: true,
      })
    ).toBeUndefined();
  });

  it("strips tools on the last budgeted step so the model must write", () => {
    const steps = Array.from({ length: ANALYTICS_CHAT_STEP_BUDGET - 1 }, () =>
      step(["read_document_page"])
    );
    expect(
      prepareAnalyticsChatStep({ steps, canEdit: true })?.activeTools
    ).toEqual([]);
  });
});
