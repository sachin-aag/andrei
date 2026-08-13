import { describe, expect, it } from "vitest";
import { buildReportContextMap } from "@/lib/ai/chat/context-map";
import { chatEditableSections } from "@/lib/ai/chat/fields";

function docWith(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

describe("buildReportContextMap", () => {
  it("summarizes each editable section with fill state and evaluation counts", () => {
    const map = buildReportContextMap({
      report: { documentNo: "DEV-123", date: "2026-01-01", status: "draft" },
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
      documents: [
        {
          attachmentId: "att_123",
          filename: "Lab Results.pdf",
          description: "Dissolution assay results for batch 24A.",
          pageCount: 4,
          ingestRunId: "run_123",
        },
      ],
    });

    expect(map).toContain("deviation DEV-123");
    expect(map).toContain("Define [define]");
    expect(map).toContain("filled");
    // one met + one partial; the not_met is bypassed so excluded
    expect(map).toContain("1 met / 1 partial / 0 not-met");
    expect(map).toContain("1 open proposal(s)");
    // analyze root cause is empty
    expect(map).toContain("Analyze [analyze] — empty");
    expect(map).toContain("analyze method: not chosen");
    expect(map).toContain("Documents (ready evidence attachments");
    expect(map).toContain("UNTRUSTED");
    expect(map).toContain('filename="Lab Results.pdf"');
    expect(map).toContain("id=att_123");
    expect(map).toContain(
      'user_context="Dissolution assay results for batch 24A."'
    );
  });

  it("surfaces the analyze method from section content and header checkboxes", () => {
    const map = buildReportContextMap({
      report: {
        documentNo: "DEV-9",
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

  it("lists design-verification sections and noun for DV reports", () => {
    const map = buildReportContextMap({
      documentType: "design_verification",
      report: { documentNo: "DV-42", date: "2026-03-01", status: "draft" },
      sections: {
        purpose_scope: {
          narrative: docWith(
            "Verify that the handpiece meets torque output requirements after sterilization."
          ),
        },
      },
      evaluations: [],
      comments: [],
    });

    expect(map).toContain("design verification DV-42");
    expect(map).toContain("Purpose & Scope [purpose_scope]");
    expect(map).not.toContain("Define [define]");
    expect(map).not.toContain("Analyze [analyze]");
    for (const section of chatEditableSections("design_verification")) {
      if (section === "cover_page") continue;
      expect(map).toContain(`[${section}]`);
    }
  });

  it("notes inline images so the model knows to call read_section for vision", () => {
    const tinyPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const map = buildReportContextMap({
      documentType: "design_verification",
      report: { documentNo: "DV-7", date: "2026-04-01", status: "draft" },
      sections: {
        test_methods: {
          narrative: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "hello" },
                  {
                    type: "imageInline",
                    attrs: {
                      src: `data:image/png;base64,${tinyPng}`,
                      alt: "Results of an Exam",
                    },
                  },
                ],
              },
            ],
          },
        },
      },
      evaluations: [],
      comments: [],
    });

    expect(map).toContain("Test Methods / Protocol Summary [test_methods]");
    expect(map).toContain("1 image");
    expect(map).toContain("call read_section to view them as vision");
    expect(map).toContain('narrative: "hello"');
  });
});

describe("buildReportContextMap — open proposals", () => {
  it("lists each open proposal with the id needed to supersede it", () => {
    const map = buildReportContextMap({
      report: { documentNo: "DEV-1", date: "2026-01-01", status: "draft" },
      sections: { define: { narrative: { type: "doc", content: [] } } },
      evaluations: [],
      comments: [
        {
          section: "define",
          kind: "ai_fix",
          status: "open",
          id: "sug-abc",
          contentPath: "narrative",
          content: JSON.stringify({
            deleteText: "",
            insertText: "",
            reasoning: "drafted the opening",
            label: "Problem statement",
            blockEdit: {
              op: "insert",
              anchor: "",
              blockIndex: -1,
              proposedMarkdown: "During routine testing the batch failed.",
            },
          }),
        },
      ],
    });
    expect(map).toContain("open proposal id=sug-abc");
    expect(map).toContain('label="Problem statement"');
    expect(map).toContain("During routine testing the batch failed.");
    expect(map).toContain("exact proposal body (quote verbatim for propose_edit)");
  });

  it("does not list resolved or dismissed proposals", () => {
    const map = buildReportContextMap({
      report: { documentNo: "DEV-1", date: "2026-01-01", status: "draft" },
      sections: {},
      evaluations: [],
      comments: [
        { section: "define", kind: "ai_fix", status: "resolved", id: "done", content: "{}" },
        { section: "define", kind: "ai_fix", status: "dismissed", id: "gone", content: "{}" },
      ],
    });
    expect(map).not.toContain("open proposal id=");
  });
});

describe("buildReportContextMap — Improve primary field", () => {
  it("treats Improve as non-empty when correctiveActions has content", () => {
    const map = buildReportContextMap({
      report: { documentNo: "DEV-1", date: "2026-01-01", status: "draft" },
      sections: {
        improve: {
          narrative: { type: "doc", content: [] },
          correctiveActions: docWith(
            "CA-1: Retrain the fill-line operator on the SOP and verify the outcome in the CAPA form."
          ),
        },
      },
      evaluations: [],
      comments: [],
    });
    expect(map).not.toMatch(/Improve \[improve\] — empty/);
    expect(map).toContain("correctiveActions:");
  });
});
