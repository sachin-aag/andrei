import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CommentRecord } from "@/types/report";
import type { SectionType } from "@/db/schema";
import {
  acceptAllSuggestions,
  acceptAllSuggestionsInReport,
  dismissAllSuggestions,
  dismissAllSuggestionsInReport,
  formatBulkApplyToast,
  formatBulkDismissToast,
  reportSuggestionQueues,
  shouldShowSuggestionBulkActions,
} from "./bulk-suggestions";

function comment(
  id: string,
  insert: string,
  anchor: string,
  section: SectionType = "define"
): CommentRecord {
  return {
    id,
    reportId: "report-1",
    parentId: null,
    sectionId: "s1",
    section,
    authorId: "ai",
    content: JSON.stringify({
      deleteText: "",
      insertText: insert,
      reasoning: "seed",
    }),
    anchorText: anchor,
    contentPath: "narrative",
    fromPos: null,
    toPos: null,
    status: "open",
    kind: "ai_fix",
    source: "ai",
    externalAuthorName: null,
    externalAuthorInitials: null,
    externalCommentId: null,
    externalCreatedAt: null,
    locked: false,
    evaluationId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const first = comment("c1", " on line FL-02", "a deviation was observed");
const second = comment("c2", " by 12%", "The result exceeded limits");
const stale = comment("c3", " missing", "this text is not in the document");

const sectionContent = {
  narrative: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "On 01/01/2026 a deviation was observed. The result exceeded limits.",
          },
        ],
      },
    ],
  },
};

describe("shouldShowSuggestionBulkActions", () => {
  it("hides the bulk row for a single suggestion", () => {
    expect(shouldShowSuggestionBulkActions(1)).toBe(false);
    expect(shouldShowSuggestionBulkActions(0)).toBe(false);
  });

  it("shows the bulk row when a queue exists", () => {
    expect(shouldShowSuggestionBulkActions(2)).toBe(true);
  });
});

describe("formatBulkApplyToast", () => {
  it("reports a full apply", () => {
    expect(formatBulkApplyToast(3, 0)).toBe("Applied 3 suggestions");
  });

  it("reports skipped leftovers as dismissed", () => {
    expect(formatBulkApplyToast(2, 1)).toBe(
      "Applied 2 suggestions. 1 no longer fits and was dismissed."
    );
    expect(formatBulkApplyToast(0, 2)).toBe(
      "None of these suggestions could be applied. They were dismissed."
    );
  });
});

describe("formatBulkDismissToast", () => {
  it("reports a full dismiss", () => {
    expect(formatBulkDismissToast(2, 0)).toBe("Dismissed 2 suggestions");
  });
});

describe("acceptAllSuggestions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("applies each locatable suggestion and skips stale ones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response)
    );

    const result = await acceptAllSuggestions({
      reportId: "report-1",
      section: "define",
      comments: [first, stale, second],
      sectionContent: structuredClone(sectionContent),
    });

    expect(result.appliedIds).toEqual(["c1", "c2"]);
    expect(result.skippedIds).toEqual(["c3"]);
    expect(result.failedIds).toEqual([]);
    const text = JSON.stringify(result.nextSection);
    expect(text).toContain("on line FL-02");
    expect(text).toContain("by 12%");
  });

  it("dismisses unlocatable leftovers instead of leaving them open", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        return { ok: true, json: async () => ({}) } as Response;
      })
    );

    const result = await acceptAllSuggestions({
      reportId: "report-1",
      section: "define",
      comments: [stale, first],
      sectionContent: structuredClone(sectionContent),
    });

    expect(result.appliedIds).toEqual(["c1"]);
    expect(result.skippedIds).toEqual(["c3"]);
    expect(urls.some((url) => url.includes("/comments/c3"))).toBe(true);
  });

  it("dismisses a queue that is entirely unlocatable", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        return { ok: true, json: async () => ({}) } as Response;
      })
    );

    const result = await acceptAllSuggestions({
      reportId: "report-1",
      section: "define",
      comments: [stale],
      sectionContent: structuredClone(sectionContent),
    });

    expect(result.appliedIds).toEqual([]);
    expect(result.skippedIds).toEqual(["c3"]);
    expect(urls.filter((url) => url.includes("/sections/"))).toHaveLength(0);
    expect(urls.some((url) => url.includes("/comments/c3"))).toBe(true);
  });

  it("PATCHes the section once for non-overlapping suggestions", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        return { ok: true, json: async () => ({}) } as Response;
      })
    );

    await acceptAllSuggestions({
      reportId: "report-1",
      section: "define",
      comments: [first, second],
      sectionContent: structuredClone(sectionContent),
    });

    expect(urls.filter((url) => url.includes("/sections/define"))).toHaveLength(1);
    expect(urls.filter((url) => url.includes("/comments/"))).toHaveLength(2);
  });

  it("applies overlapping suggestions recursively against the updated doc", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response)
    );

    const overlappingFirst = comment(
      "o1",
      "issue was seen",
      "a deviation was observed"
    );
    overlappingFirst.content = JSON.stringify({
      deleteText: "deviation was observed",
      insertText: "issue was seen",
      reasoning: "overlap-a",
    });
    const overlappingSecond = comment(
      "o2",
      "was logged. The result",
      "was observed. The result"
    );
    overlappingSecond.content = JSON.stringify({
      deleteText: "was observed. The result",
      insertText: "was logged. The result",
      reasoning: "overlap-b",
    });

    const result = await acceptAllSuggestions({
      reportId: "report-1",
      section: "define",
      comments: [overlappingFirst, overlappingSecond],
      sectionContent: structuredClone(sectionContent),
    });

    expect(result.appliedIds).toEqual(["o1"]);
    expect(result.skippedIds).toEqual(["o2"]);
    const text = JSON.stringify(result.nextSection);
    expect(text).toContain("issue was seen");
    expect(text).not.toContain("was logged");
  });

  it("stops the batch when a save fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/sections/")) {
          return { ok: false, status: 500 } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      })
    );

    const result = await acceptAllSuggestions({
      reportId: "report-1",
      section: "define",
      comments: [first, second],
      sectionContent: structuredClone(sectionContent),
    });

    expect(result.appliedIds).toEqual([]);
    expect(result.failedIds).toEqual(["c1", "c2"]);
    expect(result.skippedIds).toEqual([]);
  });

  it("previews applied content before the section PATCH", async () => {
    const order: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/sections/")) order.push("patch");
        return { ok: true, json: async () => ({}) } as Response;
      })
    );

    await acceptAllSuggestions({
      reportId: "report-1",
      section: "define",
      comments: [first, second],
      sectionContent: structuredClone(sectionContent),
      onPreview: (next) => {
        order.push("preview");
        expect(JSON.stringify(next)).toContain("on line FL-02");
      },
    });

    expect(order.slice(0, 2)).toEqual(["preview", "patch"]);
  });

  it("reverts the preview when the section PATCH fails", async () => {
    const original = structuredClone(sectionContent);
    const previews: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/sections/")) {
          return { ok: false, status: 500 } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      })
    );

    await acceptAllSuggestions({
      reportId: "report-1",
      section: "define",
      comments: [first, second],
      sectionContent: original,
      onPreview: (next) => {
        previews.push(next);
      },
    });

    expect(previews).toHaveLength(2);
    expect(JSON.stringify(previews[0])).toContain("on line FL-02");
    expect(previews[1]).toBe(original);
  });
});

const measureFirst = comment(
  "m1",
  " using a calibrated gauge",
  "Measurements were taken",
  "measure"
);

const measureContent = {
  narrative: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Measurements were taken during the run." },
        ],
      },
    ],
  },
};

const REPORT_SECTIONS: Partial<Record<SectionType, Record<string, unknown>>> = {
  define: sectionContent,
  measure: measureContent,
};

describe("reportSuggestionQueues", () => {
  it("groups open suggestions by section in document order and skips empty ones", () => {
    const queues = reportSuggestionQueues(
      ["define", "measure", "analyze"],
      [measureFirst, first, second],
      []
    );

    expect(queues.map((q) => q.section)).toEqual(["define", "measure"]);
    expect(queues[0].comments.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(queues[1].comments.map((c) => c.id)).toEqual(["m1"]);
  });
});

describe("acceptAllSuggestionsInReport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function contents() {
    return structuredClone(REPORT_SECTIONS) as Record<
      string,
      Record<string, unknown>
    >;
  }

  it("applies suggestions across every section", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response)
    );
    const sections = contents();
    const settled: SectionType[] = [];

    const result = await acceptAllSuggestionsInReport({
      reportId: "report-1",
      sectionOrder: ["define", "measure"],
      comments: [first, second, measureFirst],
      evaluations: [],
      sectionContentFor: (section) => sections[section],
      onSectionSettled: (section, next) => {
        settled.push(section);
        sections[section] = next;
      },
    });

    expect(result.appliedIds).toEqual(["c1", "c2", "m1"]);
    expect(result.changedSections).toEqual(["define", "measure"]);
    expect(settled).toEqual(["define", "measure"]);
    expect(JSON.stringify(sections.define)).toContain("on line FL-02");
    expect(JSON.stringify(sections.measure)).toContain("using a calibrated gauge");
  });

  it("keeps going in later sections after one section fails to save", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/sections/define")) {
          return { ok: false, status: 500 } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      })
    );
    const sections = contents();

    const result = await acceptAllSuggestionsInReport({
      reportId: "report-1",
      sectionOrder: ["define", "measure"],
      comments: [first, second, measureFirst],
      evaluations: [],
      sectionContentFor: (section) => sections[section],
      onSectionSettled: (section, next) => {
        sections[section] = next;
      },
    });

    expect(result.failedIds).toEqual(["c1", "c2"]);
    expect(result.appliedIds).toEqual(["m1"]);
    expect(result.changedSections).toEqual(["measure"]);
  });

  it("runs each section's transition hooks even when nothing applies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response)
    );
    const sections = contents();
    const started: SectionType[] = [];
    const ended: SectionType[] = [];

    await acceptAllSuggestionsInReport({
      reportId: "report-1",
      sectionOrder: ["define", "measure"],
      comments: [stale, measureFirst],
      evaluations: [],
      sectionContentFor: (section) => sections[section],
      onSectionStart: (section) => started.push(section),
      onSectionEnd: (section) => ended.push(section),
    });

    expect(started).toEqual(["define", "measure"]);
    expect(ended).toEqual(["define", "measure"]);
  });

  it("skips a section whose content is not loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response)
    );
    const sections = contents();

    const result = await acceptAllSuggestionsInReport({
      reportId: "report-1",
      sectionOrder: ["define", "measure"],
      comments: [first, measureFirst],
      evaluations: [],
      sectionContentFor: (section) =>
        section === "define" ? undefined : sections[section],
    });

    expect(result.skippedIds).toContain("c1");
    expect(result.appliedIds).toEqual(["m1"]);
  });
});

describe("dismissAllSuggestionsInReport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dismisses open suggestions in every section", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        return { ok: true, json: async () => ({}) } as Response;
      })
    );
    const sections = structuredClone(REPORT_SECTIONS) as Record<
      string,
      Record<string, unknown>
    >;

    const result = await dismissAllSuggestionsInReport({
      reportId: "report-1",
      sectionOrder: ["define", "measure"],
      comments: [first, second, measureFirst],
      evaluations: [],
      sectionContentFor: (section) => sections[section],
    });

    expect(result.appliedIds).toEqual(["c1", "c2", "m1"]);
    expect(urls.some((url) => url.includes("/comments/m1"))).toBe(true);
  });
});

describe("dismissAllSuggestions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dismisses every remaining suggestion", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        return { ok: true, json: async () => ({}) } as Response;
      })
    );

    const result = await dismissAllSuggestions({
      reportId: "report-1",
      section: "define",
      comments: [first, second],
      sectionContent: structuredClone(sectionContent),
    });

    expect(result.appliedIds).toEqual(["c1", "c2"]);
    expect(result.failedIds).toEqual([]);
    expect(urls.some((url) => url.includes("/comments/c1"))).toBe(true);
    expect(urls.some((url) => url.includes("/comments/c2"))).toBe(true);
  });
});
