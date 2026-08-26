import { describe, expect, it } from "vitest";
import {
  ANALYTICS_CHAT_PROMPT_VERSION,
  buildAnalyticsChatSystemPrompt,
} from "./chat-prompt";
import { createEmptyWorksheet } from "./worksheet";

describe("analytics chat prompt", () => {
  it("bumps when sixpack/scatter/ANOVA policy or tools change", () => {
    expect(ANALYTICS_CHAT_PROMPT_VERSION).toBe("analytics-chat-v5");
  });

  it("covers worksheet, sixpack, scatter, and ANOVA without drafting the report", () => {
    const prompt = buildAnalyticsChatSystemPrompt({
      documentNo: "DEV-1",
      status: "draft",
      documents: [],
      analytics: {
        id: "ws-1",
        reportId: "report-1",
        worksheet: createEmptyWorksheet(),
        analyses: [],
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z",
      },
      canEdit: true,
    });
    expect(prompt).toContain("plot_measurements");
    expect(prompt).toContain("run_one_way_anova");
    expect(prompt).toContain("Normal Capability Sixpack");
    expect(prompt).toContain("one-way ANOVA");
    expect(prompt).toContain("Bonferroni");
    expect(prompt).not.toContain("Refuse other plots and methods (Xbar-R, Xbar-S, CUSUM, EWMA, ANOVA,");
    expect(prompt).toContain("Specs tab");
    expect(prompt).toContain("Quick vs Deep");
    expect(prompt).toContain("There is no Ask/Agent toggle here");
    expect(prompt).not.toContain("draft_field");
  });
});
