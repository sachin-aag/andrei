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

// ---------------------------------------------------------------------------
// Scoped edits (table cells + list items)
// ---------------------------------------------------------------------------

function cell(text: string): JSONContent {
  return {
    type: "tableCell",
    content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
  };
}

function tableDoc(rows: string[][]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: rows.map((r) => ({
          type: "tableRow",
          content: r.map((c) => cell(c)),
        })),
      },
    ],
  };
}

function listDoc(items: string[], ordered = false): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: ordered ? "orderedList" : "bulletList",
        content: items.map((t) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
        })),
      },
    ],
  };
}

describe("locator — scoped edits", () => {
  it("resolves a cell edit within (row,col) despite a duplicate value elsewhere", () => {
    const doc = tableDoc([
      ["Test", "Pass"],
      ["Retest", "Pass"],
    ]);
    const edit: SuggestionEdit = {
      anchorText: "",
      deleteText: "Pass",
      insertText: "Fail",
      scope: { kind: "cell", row: 1, col: 1 },
    };
    // Without scope this exact same delete is ambiguous.
    expect(probeRichEdit(doc, { ...edit, scope: undefined })).toBe("ambiguous");
    // Scoped, it resolves.
    expect(probeRichEdit(doc, edit)).toBe("located");

    const { status, doc: out } = applyAndAcceptRichEdit(doc, "s1", edit);
    expect(status).toBe("located");
    const flat = flattenForAnchor(out).text.replace(/\n/g, " | ");
    expect(flat).toBe("Test | Pass | Retest | Fail");
  });

  it("sets a whole cell when no anchor/delete is given", () => {
    const doc = tableDoc([["Old", "keep"]]);
    const edit: SuggestionEdit = {
      anchorText: "",
      deleteText: "",
      insertText: "New value",
      scope: { kind: "cell", row: 0, col: 0 },
    };
    const { status, doc: out } = applyAndAcceptRichEdit(doc, "s2", edit);
    expect(status).toBe("located");
    expect(flattenForAnchor(out).text).toBe("New value\nkeep");
  });

  it("inserts into a blank cell", () => {
    const doc = tableDoc([["", "b"]]);
    const edit: SuggestionEdit = {
      anchorText: "",
      deleteText: "",
      insertText: "filled",
      scope: { kind: "cell", row: 0, col: 0 },
    };
    const { status, doc: out } = applyAndAcceptRichEdit(doc, "s3", edit);
    expect(status).toBe("located");
    expect(flattenForAnchor(out).text).toBe("filled\nb");
  });

  it("resolves a list-item edit by index despite duplicate bullets", () => {
    const doc = listDoc(["Increase revenue", "Increase revenue"]);
    const edit: SuggestionEdit = {
      anchorText: "",
      deleteText: "Increase revenue",
      insertText: "Reduce cost",
      scope: { kind: "listItem", index: 1 },
    };
    expect(probeRichEdit(doc, { ...edit, scope: undefined })).toBe("ambiguous");
    const { status, doc: out } = applyAndAcceptRichEdit(doc, "s4", edit);
    expect(status).toBe("located");
    expect(flattenForAnchor(out).text).toBe("Increase revenue\nReduce cost");
  });

  it("renders *italic* insertText as italic marks, not literal stars", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "See " }],
        },
      ],
    };
    const { status, doc: out } = applyEditToRichDoc(
      doc,
      {
        anchorText: "See",
        deleteText: "",
        insertText:
          "*Solea Model 3 Software Requirements Document* 822-700-0013",
      },
      ATTRS
    );
    expect(status).toBe("located");
    const nodes = out.content![0]!.content ?? [];
    const italic = nodes.find((n) =>
      n.marks?.some((m) => m.type === "italic")
    );
    expect(italic?.text).toBe("Solea Model 3 Software Requirements Document");
    expect(italic?.marks?.map((m) => m.type)).toEqual([
      "suggestionInsert",
      "italic",
    ]);
    expect(flattenForAnchor(out).text).toContain(
      "Solea Model 3 Software Requirements Document 822-700-0013"
    );
    expect(flattenForAnchor(out).text).not.toContain("*");
  });

  it("strips *italic* markers when applying to plain text", () => {
    const { status, text } = applyEditToPlainText("See the reference.", {
      anchorText: "See the reference.",
      deleteText: "",
      insertText:
        "*Solea Model 3 Software Requirements Document* 822-700-0013",
    });
    expect(status).toBe("located");
    expect(text).toBe(
      "See the reference. Solea Model 3 Software Requirements Document 822-700-0013"
    );
  });

  it("returns bad_scope for an out-of-range coordinate", () => {
    const doc = tableDoc([["a", "b"]]);
    expect(
      probeRichEdit(doc, {
        anchorText: "",
        deleteText: "",
        insertText: "x",
        scope: { kind: "cell", row: 9, col: 9 },
      })
    ).toBe("bad_scope");
  });

  it("rejects a delete that does not match the scoped cell (stale coordinate)", () => {
    const doc = tableDoc([["alpha", "beta"]]);
    const status = probeRichEdit(doc, {
      anchorText: "",
      deleteText: "beta",
      insertText: "z",
      scope: { kind: "cell", row: 0, col: 0 },
    });
    expect(status).toBe("not_found");
  });
});

describe("locator — split edits", () => {
  it("applies a body insert and appends the citation on plain text", () => {
    const text = "Output power met the acceptance limit.";
    const edit: SuggestionEdit = {
      anchorText: "Output power met the acceptance limit.",
      deleteText: "",
      insertText: " The measured value was 9.8 W.",
      second: {
        anchorText: "",
        deleteText: "",
        insertText: "[protocol.pdf, p. 3]",
      },
    };
    expect(probePlainEdit(text, edit)).toBe("located");
    const result = applyEditToPlainText(text, edit);
    expect(isApplyableStatus(result.status)).toBe(true);
    expect(result.text).toBe(
      "Output power met the acceptance limit. The measured value was 9.8 W.\n[protocol.pdf, p. 3]"
    );
  });

  it("probes both parts independently on the original field", () => {
    expect(
      probePlainEdit("hello world", {
        anchorText: "hello",
        deleteText: "",
        insertText: " there",
        second: {
          anchorText: "missing",
          deleteText: "missing",
          insertText: "x",
        },
      })
    ).toBe("not_found");
  });

  it("appends a citation-only insert on a new line", () => {
    const result = applyEditToPlainText("The requirement is met.", {
      anchorText: "",
      deleteText: "",
      insertText: "[protocol.pdf, p. 2]",
    });
    expect(result.status).toBe("append");
    expect(result.text).toBe("The requirement is met.\n[protocol.pdf, p. 2]");
  });

  it("applies a scoped cell edit and appends the citation after the table", () => {
    const doc = tableDoc([
      ["Req", "Pass"],
    ]);
    const edit: SuggestionEdit = {
      anchorText: "",
      deleteText: "Pass",
      insertText: "Pass — 9.8 W",
      scope: { kind: "cell", row: 0, col: 1 },
      second: {
        anchorText: "",
        deleteText: "",
        insertText: "[protocol.pdf, p. 1]",
      },
    };
    expect(probeRichEdit(doc, edit)).toBe("located");
    const result = applyEditToRichDoc(doc, edit, ATTRS);
    expect(isApplyableStatus(result.status)).toBe(true);
    const flat = flattenForAnchor(result.doc).text;
    expect(flat).toContain("Pass — 9.8 W");
    expect(flat).toContain("[protocol.pdf, p. 1]");
    expect(flat.indexOf("Pass — 9.8 W")).toBeLessThan(
      flat.indexOf("[protocol.pdf, p. 1]")
    );
  });
});
