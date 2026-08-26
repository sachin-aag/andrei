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
  createdAt: "2026-08-26T00:00:00.000Z",
  updatedAt: "2026-08-26T00:00:00.000Z",
};

describe("analytics chat prompt", () => {
  it("bumps when sixpack/scatter/ANOVA policy or tools change", () => {
    expect(ANALYTICS_CHAT_PROMPT_VERSION).toBe("analytics-chat-v10");
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
    expect(prompt).toContain("scan_attachments");
    expect(prompt).toContain("manage_worksheet");
    expect(prompt).toContain("create a new data sheet");
    expect(prompt).toContain("Do not search attachments, scan files, extract numbers");
    expect(prompt).toContain("run_one_way_anova");
    expect(prompt).toContain("Normal Capability Sixpack");
    expect(prompt).toContain("one-way ANOVA");
    expect(prompt).toContain("Bonferroni");
    expect(prompt).not.toContain("Refuse other plots and methods (Xbar-R, Xbar-S, CUSUM, EWMA, ANOVA,");
    expect(prompt).toContain("Column specs: none");
    expect(prompt).not.toContain("Specs tab");
    expect(prompt).toContain("Quick vs Deep");
    expect(prompt).toContain("## Mode: AGENT");
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
