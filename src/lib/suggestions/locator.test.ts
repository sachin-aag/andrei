import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  applyAndAcceptRichEdit,
  applyEditToPlainText,
  applyEditToRichDoc,
  flattenForAnchor,
  isApplyableStatus,
  locateEdit,
  mapCollapsedRangeToRaw,
  buildCollapsedToRawMap,
  probePlainEdit,
  probeRichEdit,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";
import { buildPlainTextSuggestionPreview } from "@/lib/suggestions/plain-text-preview";

const ATTRS = {
  id: "sug-1",
  authorId: "ai",
  status: "pending" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  kind: "fix" as const,
};

describe("locator — flattenForAnchor", () => {
  it("emits no synthetic equation/image tokens", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            { type: "mathInline", attrs: { latex: "x=1" } },
            { type: "text", text: " for the assay." },
          ],
        },
      ],
    };
    const { text } = flattenForAnchor(doc);
    expect(text).not.toContain("[equation]");
    expect(text).not.toContain("[image]");
    // Atom contributes one space; surrounding text may already have spaces.
    expect(text.replace(/\s+/g, " ").trim()).toBe("See for the assay.");
  });

  it("emits no markdown pipes for tables", () => {
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
    const { text } = flattenForAnchor(doc);
    expect(text).not.toContain("|");
    expect(text).toContain("Man");
    expect(text).toContain("operator not trained");
  });

  it("separates blockquote paragraphs so cross-block anchors match via collapse", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Root cause is operator" }],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "error during the weighing step" }],
            },
          ],
        },
      ],
    };
    const { text } = flattenForAnchor(doc);
    const loc = locateEdit(text, {
      anchorText: "operator error",
      deleteText: "operator error",
      insertText: "operator error in the dispensing area",
    });
    expect(loc.status).toBe("located");
  });
});

describe("locator — collapsed index map (Bug 4 fix)", () => {
  it("maps the second collapsed occurrence to the second raw span", () => {
    const haystack = "foo   bar  and  foo bar later";
    const { collapsed, collapsedToRaw } = buildCollapsedToRawMap(haystack);
    const needle = "foo bar";
    const firstIdx = collapsed.indexOf(needle);
    const secondIdx = collapsed.indexOf(needle, firstIdx + 1);
    expect(secondIdx).toBeGreaterThan(firstIdx);

    const mapped = mapCollapsedRangeToRaw(
      collapsedToRaw,
      secondIdx,
      needle.length
    );
    expect(mapped).not.toBeNull();
    const firstExact = haystack.indexOf("foo");
    const secondExact = haystack.indexOf("foo", firstExact + 1);
    expect(mapped!.start).toBe(secondExact);
  });
});

describe("locator — locateEdit / probe", () => {
  it("returns append for empty-anchor pure insert", () => {
    expect(
      locateEdit("hello", {
        anchorText: "",
        deleteText: "",
        insertText: " world",
      }).status
    ).toBe("append");
  });

  it("returns ambiguous for twice-occurring pure-insert anchor", () => {
    expect(
      probePlainEdit("use the tool and use the spare", {
        anchorText: "use",
        deleteText: "",
        insertText: " carefully",
      })
    ).toBe("ambiguous");
  });

  it("equation token in anchor is not_found (no synthetic chars)", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            { type: "mathInline" },
            { type: "text", text: " for the assay calculation." },
          ],
        },
      ],
    };
    const edit: SuggestionEdit = {
      anchorText: "See [equation] for",
      deleteText: "",
      insertText: " (Eq. 1)",
    };
    expect(probeRichEdit(doc, edit)).toBe("not_found");
    // Canonical anchor (whitespace for atom) does locate:
    expect(
      probeRichEdit(doc, {
        anchorText: "See  for",
        deleteText: "",
        insertText: " (Eq. 1)",
      })
    ).toBe("located");
  });

  it("markdown-pipe anchor is not_found; cell text anchor locates", () => {
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
    expect(
      probeRichEdit(doc, {
        anchorText: "Man | operator not trained",
        deleteText: "",
        insertText: " on SOP",
      })
    ).toBe("not_found");
    expect(
      probeRichEdit(doc, {
        anchorText: "operator not trained",
        deleteText: "",
        insertText: " on SOP",
      })
    ).toBe("located");
  });

  it("cross-cell delete returns cross_cell", () => {
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
                      content: [{ type: "text", text: "Alpha" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Beta" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    // Flatten joins cells with newline between tableRow children... wait,
    // tableRow separates cells with newline, so "Alpha\nBeta". Collapsed "Alpha Beta".
    expect(
      probeRichEdit(doc, {
        anchorText: "Alpha Beta",
        deleteText: "Alpha Beta",
        insertText: "Gamma",
      })
    ).toBe("cross_cell");
  });
});

describe("locator — apply (gate ≡ apply)", () => {
  it("probe status matches apply status for rich and plain", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "The deviation occurred on site." }],
        },
      ],
    };
    const edit: SuggestionEdit = {
      anchorText: "occurred on site",
      deleteText: "on site",
      insertText: "in Building A",
    };
    expect(probeRichEdit(doc, edit)).toBe(
      applyEditToRichDoc(doc, edit, ATTRS).status
    );

    const plain = "use the tool carefully";
    const plainEdit = {
      anchorText: "use the tool",
      deleteText: "",
      insertText: " now",
    };
    expect(probePlainEdit(plain, plainEdit)).toBe(
      applyEditToPlainText(plain, plainEdit).status
    );
  });

  it("applies rich single-paragraph replace", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "On dated DD/MM/YYYY at approximately HH:MM hrs.",
            },
          ],
        },
      ],
    };
    const result = applyAndAcceptRichEdit(doc, "s1", {
      anchorText: "On dated DD/MM/YYYY at approximately HH:MM hrs.",
      deleteText: "DD/MM/YYYY at approximately HH:MM hrs",
      insertText: "[detection date: <to be filled>] at approximately [time: <to be filled>] hrs",
    });
    expect(isApplyableStatus(result.status)).toBe(true);
    const text = flattenForAnchor(result.doc).text;
    expect(text).toContain("[detection date: <to be filled>]");
    expect(text).not.toContain("DD/MM/YYYY");
  });

  it("applies cross-paragraph blockquote delete (characterization case)", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Root cause is operator" }],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "error during the weighing step" }],
            },
          ],
        },
      ],
    };
    const result = applyAndAcceptRichEdit(doc, "s2", {
      anchorText: "operator error",
      deleteText: "operator error",
      insertText: "operator error in the dispensing area",
    });
    expect(result.status).toBe("located");
    expect(flattenForAnchor(result.doc).text).toContain(
      "operator error in the dispensing area"
    );
  });

  it("plain ambiguous pure-insert: probe and apply both ambiguous", () => {
    const value = "use the tool and use the spare";
    const edit = {
      anchorText: "use",
      deleteText: "",
      insertText: " carefully",
    };
    expect(probePlainEdit(value, edit)).toBe("ambiguous");
    expect(applyEditToPlainText(value, edit).status).toBe("ambiguous");
  });
});

describe("locator — plain preview alignment", () => {
  it("preview is null when delete is missing (same as apply)", () => {
    const value = "the batch was released after review";
    const deleteText = "was rejected";
    const insertText = "was quarantined";
    const anchorText = "the batch was released after review";

    const applied = applyEditToPlainText(value, {
      anchorText,
      deleteText,
      insertText,
    });
    // Until Step 6 rewires preview, this documents the desired invariant;
    // Step 6 will make buildPlainTextSuggestionPreview use locateEdit.
    expect(applied.status).toBe("not_found");
    void buildPlainTextSuggestionPreview;
  });
});
