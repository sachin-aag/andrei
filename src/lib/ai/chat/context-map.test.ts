import { describe, expect, it } from "vitest";
import { buildReportContextMap } from "@/lib/ai/chat/context-map";

function docWith(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

describe("buildReportContextMap", () => {
  it("summarizes each editable section with fill state and evaluation counts", () => {
    const map = buildReportContextMap({
      report: { deviationNo: "DEV-123", date: "2026-01-01", status: "draft" },
      sections: {
        define: {
          narrative: docWith(
            "During routine testing the tablet batch failed dissolution at 68 percent, well below the 80 percent specification, triggering this deviation investigation."
          ),
        },
        analyze: { rootCause: { narrative: docWith("") } },
      },
      evaluations: [
        { section: "define", status: "met" },
        { section: "define", status: "partially_met" },
        { section: "define", status: "not_met", bypassed: true },
      ],
      comments: [{ section: "define", kind: "ai_fix", status: "open" }],
    });

    expect(map).toContain("deviation DEV-123");
    expect(map).toContain("Define [define]");
    expect(map).toContain("filled");
    // one met + one partial; the not_met is bypassed so excluded
    expect(map).toContain("1 met / 1 partial / 0 not-met");
    expect(map).toContain("1 open suggestion(s)");
    // analyze root cause is empty
    expect(map).toContain("Analyze [analyze] — empty");
    expect(map).toContain("analyze method: not chosen");
  });

  it("surfaces the analyze method from section content and header checkboxes", () => {
    const map = buildReportContextMap({
      report: {
        deviationNo: "DEV-9",
        date: "2026-02-01",
        status: "draft",
        toolsUsed: { sixM: false, fiveWhy: true, brainstorming: false },
      },
      sections: {
        analyze: {
          fiveWhy: {
            narrative: docWith("Why 1: seal leak at station 3"),
            conclusion: "",
          },
          rootCause: { narrative: docWith("Seal integrity failure") },
        },
      },
      evaluations: [],
      comments: [],
    });

    expect(map).toContain(
      "analyze method: 5-Why (from section content); header checkbox: 5-Why"
    );
  });
});
