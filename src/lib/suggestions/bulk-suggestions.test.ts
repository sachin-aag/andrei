import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CommentRecord } from "@/types/report";
import {
  acceptAllSuggestions,
  dismissAllSuggestions,
  formatBulkApplyToast,
  formatBulkDismissToast,
  shouldShowSuggestionBulkActions,
} from "./bulk-suggestions";

function comment(id: string, insert: string, anchor: string): CommentRecord {
  return {
    id,
    reportId: "report-1",
    parentId: null,
    sectionId: "s1",
    section: "define",
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

  it("reports skipped leftovers", () => {
    expect(formatBulkApplyToast(2, 1)).toBe(
      "Applied 2 suggestions. 1 no longer fits and was left open."
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
    expect(result.failedIds).toEqual(["c1"]);
    expect(result.skippedIds).toEqual([]);
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
