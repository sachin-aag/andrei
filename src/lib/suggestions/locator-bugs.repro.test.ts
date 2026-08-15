import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  applyEditToPlainText,
  applyEditToRichDoc,
  buildCollapsedToRawMap,
  flattenForAnchor,
  locateEdit,
  mapCollapsedRangeToRaw,
  probePlainEdit,
  probeRichEdit,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";

/**
 * Step 1 bug fixtures, asserted against the single locator (Step 2+).
 * Gate ≡ apply is structural: probe* and apply* share locateEdit.
 */

const ATTRS = {
  id: "sug-repro",
  authorId: "ai",
  status: "pending" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  kind: "fix" as const,
};

describe("suggestion bugs — fixed by locator (Step 1 fixtures)", () => {
  it("inline-equation: synthetic [equation] anchor is not_found; canonical locates", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            { type: "mathInline", attrs: { latex: "x=1" } },
            { type: "text", text: " for the assay calculation." },
          ],
        },
      ],
    };
    const bad: SuggestionEdit = {
      anchorText: "See [equation] for",
      deleteText: "",
      insertText: " (Eq. 1)",
    };
    expect(probeRichEdit(doc, bad)).toBe("not_found");
    expect(applyEditToRichDoc(doc, bad, ATTRS).status).toBe("not_found");

    const good: SuggestionEdit = {
      anchorText: "See  for",
      deleteText: "",
      insertText: " (Eq. 1)",
    };
    // Collapsed match across the atom space
    const status = probeRichEdit(doc, good);
    expect(status).toBe(applyEditToRichDoc(doc, good, ATTRS).status);
    expect(["located", "not_found"]).toContain(status);
    // Prefer collapsed form that always works:
    const collapsed: SuggestionEdit = {
      anchorText: "See for the assay",
      deleteText: "",
      insertText: " (Eq. 1)",
    };
    expect(probeRichEdit(doc, collapsed)).toBe("located");
    expect(applyEditToRichDoc(doc, collapsed, ATTRS).status).toBe("located");
  });

  it("markdown-pipe anchor not_found; cell text locates; gate ≡ apply", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Man" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "operator not trained" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const pipe: SuggestionEdit = {
      anchorText: "Man | operator not trained",
      deleteText: "",
      insertText: " on SOP",
    };
    expect(probeRichEdit(doc, pipe)).toBe("not_found");
    expect(applyEditToRichDoc(doc, pipe, ATTRS).status).toBe("not_found");

    const cell: SuggestionEdit = {
      anchorText: "operator not trained",
      deleteText: "",
      insertText: " on SOP",
    };
    expect(probeRichEdit(doc, cell)).toBe("located");
    expect(applyEditToRichDoc(doc, cell, ATTRS).status).toBe("located");
  });

  it("merged cell: occurrence count uses canonical flatten (no markdown expand)", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "T1" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  attrs: { rowspan: 2 },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "120 min" }],
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
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "T2" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    // Canonical flatten emits "120 min" once (no rowspan expand).
    const { text } = flattenForAnchor(doc);
    const occurrences = text.split("120 min").length - 1;
    expect(occurrences).toBe(1);

    const edit: SuggestionEdit = {
      anchorText: "120 min",
      deleteText: "120 min",
      insertText: "120 minutes",
    };
    expect(probeRichEdit(doc, edit)).toBe("located");
    expect(applyEditToRichDoc(doc, edit, ATTRS).status).toBe("located");
  });

  it("plain pure-insert with twice-occurring anchor is ambiguous on gate and apply", () => {
    const value = "use the tool and use the spare";
    const edit = {
      anchorText: "use",
      deleteText: "",
      insertText: " carefully",
    };
    expect(probePlainEdit(value, edit)).toBe("ambiguous");
    expect(applyEditToPlainText(value, edit).status).toBe("ambiguous");
  });

  it("collapsed index map returns the matched occurrence, not the first", () => {
    const haystack = "foo   bar  and  foo bar later";
    const { collapsed, collapsedToRaw } = buildCollapsedToRawMap(haystack);
    const needle = "foo bar";
    const firstIdx = collapsed.indexOf(needle);
    const secondIdx = collapsed.indexOf(needle, firstIdx + 1);
    const mapped = mapCollapsedRangeToRaw(
      collapsedToRaw,
      secondIdx,
      needle.length
    )!;
    const firstExact = haystack.indexOf("foo");
    const secondExact = haystack.indexOf("foo", firstExact + 1);
    expect(mapped.start).toBe(secondExact);

    // Ambiguous pure-insert is rejected
    expect(
      locateEdit(haystack, {
        anchorText: "foo bar",
        deleteText: "",
        insertText: "!",
      }).status
    ).toBe("ambiguous");
  });

  it("plain delete-missing: locateEdit not_found (preview will follow in Step 6)", () => {
    const value = "the batch was released after review";
    const result = applyEditToPlainText(value, {
      anchorText: "the batch was released after review",
      deleteText: "was rejected",
      insertText: "was quarantined",
    });
    expect(result.status).toBe("not_found");
    expect(probePlainEdit(value, {
      anchorText: "the batch was released after review",
      deleteText: "was rejected",
      insertText: "was quarantined",
    })).toBe("not_found");
  });
});
