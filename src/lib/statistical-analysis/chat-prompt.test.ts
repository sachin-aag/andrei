import { describe, expect, it } from "vitest";
import {
  ANALYTICS_CHAT_PROMPT_VERSION,
  buildAnalyticsChatSystemPrompt,
} from "./chat-prompt";
import { createEmptyWorksheet } from "./worksheet";
import type { ReportAnalyticsView } from "./types";

const emptyAnalytics: ReportAnalyticsView = {
  id: "ws-1",
  reportId: "report-1",
  worksheet: createEmptyWorksheet(),
  analyses: [],
  version: 1,
  createdAt: "2026-08-26T00:00:00.000Z",
  updatedAt: "2026-08-26T00:00:00.000Z",
};

describe("analytics chat prompt", () => {
  it("bumps when sixpack/scatter/ANOVA policy or tools change", () => {
    expect(ANALYTICS_CHAT_PROMPT_VERSION).toBe("analytics-chat-v23");
  });

  it("covers worksheet, sixpack, scatter, and ANOVA without drafting the report", () => {
    const prompt = buildAnalyticsChatSystemPrompt({
      documentNo: "DEV-1",
      status: "draft",
      documents: [],
      analytics: emptyAnalytics,
      canEdit: true,
      mode: "agent",
    });
    expect(prompt).toContain("plot_measurements");
    expect(prompt).toContain("plot_xy_scatter");
    expect(prompt).toContain("Optional lsl / usl override");
    expect(prompt).toContain("scan_attachments");
    expect(prompt).toContain("manage_worksheet");
    expect(prompt).toContain("create a new data sheet");
    expect(prompt).toContain("Do not search attachments, scan files, extract numbers");
    expect(prompt).toContain("one manage_worksheet call with operations");
    expect(prompt).toContain("add_column always assigns a new id");
    expect(prompt).toContain("one write_column call with columns");
    expect(prompt).toContain("Do not call write_column once per column");
    expect(prompt).toContain("do not fill a series with set_cell");
    expect(prompt).toContain("Never say the worksheet was filled");
    expect(prompt).toContain("Pasting a table into chat is not writing it");
    expect(prompt).toContain("Never ask_user which page to read");
    expect(prompt).toContain("A page can hold more than one table");
    expect(prompt).toContain("do not substitute a different table");
    expect(prompt).toContain("sourceAttachmentId and sourcePages");
    expect(prompt).toContain("Do not write 0 or any other number");
    expect(prompt).toContain("Do not copy decimal format from a neighboring column");
    expect(prompt).toContain("whether you are stuck");
    expect(prompt).toContain("at most two search_documents calls");
    expect(prompt).toContain("truncated does not mean grep again");
    expect(prompt).toContain("run_one_way_anova");
    expect(prompt).toContain("Normal Capability Sixpack");
    expect(prompt).toContain("one-way ANOVA");
    expect(prompt).toContain("worksheet scatter (with optional legend)");
    expect(prompt).toContain("Pearson r");
    expect(prompt).toContain("Bonferroni");
    expect(prompt).toContain("Never call run_capability_sixpack or run_one_way_anova as a substitute");
    expect(prompt).toContain("Editing with analysisId updates that same row");
    expect(prompt).toContain("showSpecLimits true/false");
    expect(prompt).toContain("the plot cites those pages");
    expect(prompt).toContain("no Plot-from-attachments menu");
    expect(prompt).toContain("use a label column as X");
    expect(prompt).not.toContain("Refuse other plots and methods (Xbar-R, Xbar-S, CUSUM, EWMA, ANOVA,");
    expect(prompt).toContain("Column specs: none");
    expect(prompt).not.toContain("Specs tab");
    expect(prompt).toContain("Quick vs Deep");
    expect(prompt).not.toContain("There is no Ask/Agent toggle here");
    expect(prompt).not.toContain("draft_field");
  });

  it("tells Ask mode to search only and switch to Agent to write", () => {
    const prompt = buildAnalyticsChatSystemPrompt({
      documentNo: "DEV-1",
      status: "draft",
      documents: [],
      analytics: emptyAnalytics,
      canEdit: true,
      mode: "plan",
    });
    expect(prompt).toContain("## Mode: ASK");
    expect(prompt).toContain("switch to Agent");
    expect(prompt).toContain("Ask mode: search and extract only");
    expect(prompt).not.toContain("The engineer can save the worksheet");
  });
});
