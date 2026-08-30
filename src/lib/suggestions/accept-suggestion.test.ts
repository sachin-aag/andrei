import { describe, expect, it, vi, beforeEach } from "vitest";
import type { JSONContent } from "@tiptap/core";
import type { CommentRecord } from "@/types/report";
import {
  acceptSuggestion,
  dismissSuggestion,
  SectionPersistError,
} from "@/lib/suggestions/accept-suggestion";
import {
  injectSuggestionMarks,
  stripPendingSuggestionsExcept,
} from "@/lib/tiptap/suggestion-inject";
import { flattenForAnchor } from "@/lib/suggestions/locator";

const reportId = "report-1";
const comment: CommentRecord = {
  id: "c1",
  reportId,
  parentId: null,
  sectionId: "s1",
  section: "define",
  authorId: "ai",
  content: JSON.stringify({
    deleteText: "DD/MM/YYYY",
    insertText: "[detection date: <to be filled>]",
    reasoning: "date missing",
  }),
  anchorText:
    "On dated DD/MM/YYYY at approximately HH:MM hrs, while performing routine operation.",
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

const sectionContent = {
  narrative: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "On dated DD/MM/YYYY at approximately HH:MM hrs, while performing routine operation.",
          },
        ],
      },
    ],
  },
};

describe("acceptSuggestion / dismissSuggestion (one writer)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("accept applies then saves then resolves — identical nextSection for any surface", async () => {
    const fetches: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        fetches.push({ url: String(url), body });
        return { ok: true, json: async () => ({}) } as Response;
      })
    );

    const a = await acceptSuggestion({
      reportId,
      section: "define",
      comment,
      sectionContent: structuredClone(sectionContent),
    });
    const b = await acceptSuggestion({
      reportId,
      section: "define",
      comment,
      sectionContent: structuredClone(sectionContent),
    });

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.nextSection).toEqual(b.nextSection);
      const text = JSON.stringify(a.nextSection);
      expect(text).toContain("[detection date: <to be filled>]");
      expect(text).not.toContain("DD/MM/YYYY");
    }

    // First accept: section PATCH then comment PATCH
    expect(fetches[0]?.url).toContain("/sections/define");
    expect(fetches[1]?.url).toContain("/comments/c1");
    expect(fetches[1]?.body).toEqual({ status: "resolved" });
  });

  it("tracked_change apply keeps insert/delete marks as accepted revisions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response)
    );

    const result = await acceptSuggestion({
      reportId,
      section: "body",
      comment: { ...comment, section: "body" },
      sectionContent: structuredClone(sectionContent),
      applyMode: "tracked_change",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const json = JSON.stringify(result.nextSection);
    expect(json).toContain("suggestionInsert");
    expect(json).toContain("suggestionDelete");
    expect(json).toContain('"status":"accepted"');
    expect(json).not.toContain('"status":"pending"');
    expect(json).toContain("DD/MM/YYYY");
    expect(json).toContain("[detection date: <to be filled>]");
  });

  it("tracked_change accept of an already-injected preview commits marks so they survive strip", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response)
    );

    const bodyComment = { ...comment, section: "body" as const };
    const payload = JSON.parse(bodyComment.content) as {
      deleteText: string;
      insertText: string;
    };
    const preview = injectSuggestionMarks(
      structuredClone(sectionContent.narrative),
      {
        anchorText: bodyComment.anchorText ?? "",
        deleteText: payload.deleteText,
        insertText: payload.insertText,
      },
      {
        id: bodyComment.id,
        authorId: "ai",
        status: "pending",
        createdAt: bodyComment.createdAt,
        kind: "fix",
      }
    );
    expect(preview.located).toBe(true);

    const result = await acceptSuggestion({
      reportId,
      section: "body",
      comment: bodyComment,
      sectionContent: { narrative: preview.doc },
      applyMode: "tracked_change",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const narrative = (result.nextSection.narrative ?? result.nextSection) as JSONContent;
    const json = JSON.stringify(narrative);
    expect(json).toContain('"status":"accepted"');
    const stripped = stripPendingSuggestionsExcept(narrative, null);
    expect(JSON.stringify(stripped)).toContain("suggestionInsert");
    expect(JSON.stringify(stripped)).toContain("[detection date: <to be filled>]");
  });

  it("accept leaves comment open when locate fails (no status flip)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await acceptSuggestion({
      reportId,
      section: "define",
      comment: {
        ...comment,
        anchorText: "text that is not in the document",
        content: JSON.stringify({
          deleteText: "missing",
          insertText: "x",
          reasoning: "x",
        }),
      },
      sectionContent: structuredClone(sectionContent),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accept returns save_failed with SectionPersistError on 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: "Forbidden" }) }) as Response)
    );

    const result = await acceptSuggestion({
      reportId,
      section: "define",
      comment,
      sectionContent: structuredClone(sectionContent),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("save_failed");
      expect(result.error).toBeInstanceOf(SectionPersistError);
      expect((result.error as Error).message).toBe(
        "You can't save changes to this report."
      );
    }
  });

  it("dismiss flips status without requiring locate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response)
    );

    const result = await dismissSuggestion({
      reportId,
      section: "define",
      comment,
      sectionContent: structuredClone(sectionContent),
    });
    expect(result.ok).toBe(true);
  });
});

function equipmentTable(manufacturer: string) {
  return {
    narrative: {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Equipment" }],
                    },
                  ],
                },
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Manufacturer" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "UUT-1" }] },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: manufacturer }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

describe("acceptSuggestion table operations", () => {
  const tableComment: CommentRecord = {
    ...comment,
    content: JSON.stringify({
      deleteText: "",
      insertText: "",
      reasoning: "Add Description",
      tableOperation: {
        kind: "insert_column",
        tableIndex: 0,
        afterCol: 1,
        header: "Description",
        values: ["Dental laser"],
        expectedHeaderAtAfterCol: "Manufacturer",
        expectedHeaders: ["Equipment", "Manufacturer"],
      },
    }),
    anchorText: "Add “Description” column; populate 1 row",
    contentPath: "narrative",
  };

  it("applies a column insert against concurrently filled cells and keeps them", async () => {
    const fetches: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        fetches.push({ url: String(url), body });
        return { ok: true, json: async () => ({}) } as Response;
      })
    );

    const result = await acceptSuggestion({
      reportId,
      section: "define",
      comment: tableComment,
      sectionContent: equipmentTable("Acme Corp"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = JSON.stringify(result.nextSection);
    expect(text).toContain("Acme Corp");
    expect(text).toContain("Description");
    expect(text).toContain("Dental laser");
    expect(fetches[0]?.url).toContain("/sections/define");
    expect(fetches[1]?.url).toContain("/comments/c1");
    expect(fetches[1]?.body).toEqual({ status: "resolved" });
  });

  it("leaves the comment open when table preconditions no longer match", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await acceptSuggestion({
      reportId,
      section: "define",
      comment: {
        ...tableComment,
        content: JSON.stringify({
          deleteText: "",
          insertText: "",
          reasoning: "Add Description",
          tableOperation: {
            kind: "insert_column",
            tableIndex: 0,
            afterCol: 1,
            header: "Description",
            values: ["Dental laser"],
            expectedHeaderAtAfterCol: "Maker",
            expectedHeaders: ["Equipment", "Maker"],
          },
        }),
      },
      sectionContent: equipmentTable("Acme Corp"),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("acceptSuggestion split citation", () => {
  it("applies the body change and appends the citation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response)
    );

    const result = await acceptSuggestion({
      reportId,
      section: "define",
      comment: {
        ...comment,
        content: JSON.stringify({
          deleteText: "",
          insertText: " The measured value was 9.8 W.",
          reasoning: "Adds the reading and parks the cite",
          second: {
            anchorText: "",
            deleteText: "",
            insertText: "[protocol.pdf, p. 3]",
          },
        }),
        anchorText: "while performing routine operation.",
      },
      sectionContent: structuredClone(sectionContent),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = JSON.stringify(result.nextSection);
    expect(text).toContain("The measured value was 9.8 W.");
    expect(text).toContain("Citations:");
    expect(text).toContain("[protocol.pdf, p. 3]");
  });
});

describe("acceptSuggestion supersession", () => {
  it("dismisses older contained siblings instead of applying them", async () => {
    const fetches: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        fetches.push({
          url: String(url),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return { ok: true, json: async () => ({}) } as Response;
      })
    );

    const narrative = {
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
    };
    const older: CommentRecord = {
      ...comment,
      id: "old",
      content: JSON.stringify({
        deleteText: "deviation was observed",
        insertText: "issue was seen",
        reasoning: "narrow",
      }),
      anchorText: "a deviation was observed",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const newer: CommentRecord = {
      ...comment,
      id: "new",
      content: JSON.stringify({
        deleteText: "a deviation was observed. The result",
        insertText: "the issue was logged. The result",
        reasoning: "cover",
      }),
      anchorText: "a deviation was observed. The result",
      createdAt: "2026-01-01T00:01:00.000Z",
    };

    const result = await acceptSuggestion({
      reportId,
      section: "define",
      comment: newer,
      sectionContent: { narrative },
      openComments: [older, newer],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dismissed.map((row) => row.id)).toEqual(["old"]);
    expect(result.dismissed[0]?.status).toBe("dismissed");
    expect(result.dismissed[0]?.content).toContain("superseded_by:new");
    const dismissedPatch = fetches.find(
      (call) => call.url.includes("/comments/old")
    );
    expect(dismissedPatch?.body).toMatchObject({
      status: "dismissed",
    });
  });
});

describe("acceptSuggestion same-turn table pair", () => {
  function labels(content: Record<string, unknown>): string[] {
    const doc = content.narrative as JSONContent;
    return (doc.content ?? []).map((block) => {
      if (block.type === "table") {
        const text = flattenForAnchor(block).text.replace(/\s+/g, " ").trim();
        return text.startsWith("VCS") ? "new-table" : "existing-table";
      }
      const text = flattenForAnchor(block).text.replace(/\s+/g, " ").trim();
      if (/^citations:?$/i.test(text)) return "citations";
      return text || block.type || "";
    });
  }

  const existingTable: JSONContent = {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Req" }] },
            ],
          },
        ],
      },
    ],
  };

  const field = {
    narrative: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Purpose of this verification." }],
        },
        existingTable,
        {
          type: "paragraph",
          content: [{ type: "text", text: "Citations:" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "1. [protocol.pdf, p. 1]" }],
        },
      ],
    },
  };

  const leadIn: CommentRecord = {
    ...comment,
    id: "lead",
    section: "purpose",
    content: JSON.stringify({
      deleteText: "",
      insertText: "The VCS mapping follows.",
      reasoning: "intro",
      pairedBlockSuggestionId: "tbl",
      placeBeforePairedBlock: "table",
    }),
    anchorText: "",
    contentPath: "narrative",
  };

  const tableCard: CommentRecord = {
    ...comment,
    id: "tbl",
    section: "purpose",
    content: JSON.stringify({
      deleteText: "",
      insertText: "",
      reasoning: "table",
      tableOperation: {
        kind: "create_table",
        headers: ["VCS", "Meaning"],
        rows: [["1", "Design"]],
      },
      placeAfterSuggestionId: "lead",
    }),
    anchorText: "Create a 2-column table with 1 row",
    contentPath: "narrative",
  };

  it("accepts the table card and still lands intro then table before Citations", async () => {
    const fetches: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        fetches.push({ url: String(url), body });
        return { ok: true, json: async () => ({}) } as Response;
      })
    );

    const result = await acceptSuggestion({
      reportId,
      section: "purpose",
      comment: tableCard,
      sectionContent: field,
      openComments: [leadIn, tableCard],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const order = labels(result.nextSection);
    expect(order.indexOf("existing-table")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("The VCS mapping follows.")).toBeGreaterThan(
      order.indexOf("existing-table")
    );
    expect(order.indexOf("new-table")).toBeGreaterThan(
      order.indexOf("The VCS mapping follows.")
    );
    expect(order.indexOf("citations")).toBeGreaterThan(order.indexOf("new-table"));
    const resolved = fetches.filter((call) =>
      String(call.body && (call.body as { status?: string }).status) ===
      "resolved"
    );
    expect(resolved).toHaveLength(2);
  });

  it("does not dismiss the sibling when one card is ignored", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response)
    );
    const result = await dismissSuggestion({
      reportId,
      section: "purpose",
      comment: tableCard,
      sectionContent: field,
    });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.ok ? result.nextSection : null)).not.toContain(
      "The VCS mapping follows."
    );
  });
});
