import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  collectPendingSuggestionMarkIds,
  injectSuggestionMarks,
  richDocsMatchIgnoringAiPreview,
  shouldApplyExternalValueToEditor,
  shouldSkipSuggestionDocSync,
  stripPendingSuggestionsExcept,
} from "./suggestion-inject";

describe("stripPendingSuggestionsExcept", () => {
  it("removes other pending suggestion previews from the doc", () => {
    const base: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "On 15/05/2025 at approximately 10:00 hrs." }],
        },
      ],
    };

    const first = injectSuggestionMarks(
      base,
      {
        anchorText: "On 15/05/2025",
        deleteText: "",
        insertText: " first",
      },
      {
        id: "suggestion-a",
        authorId: "ai",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
        kind: "fix",
      }
    ).doc;

    const both = injectSuggestionMarks(
      first,
      {
        anchorText: "10:00 hrs",
        deleteText: "10:00 hrs",
        insertText: "[Time: <to be filled>] hrs",
      },
      {
        id: "suggestion-b",
        authorId: "ai",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
        kind: "fix",
      }
    ).doc;

    expect(collectPendingSuggestionMarkIds(both).sort()).toEqual([
      "suggestion-a",
      "suggestion-b",
    ]);

    const onlyA = stripPendingSuggestionsExcept(both, "suggestion-a");
    expect(collectPendingSuggestionMarkIds(onlyA)).toEqual(["suggestion-a"]);
  });

  it("does not strip human track-change marks", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "hello",
              marks: [
                {
                  type: "suggestionInsert",
                  attrs: {
                    id: "human-tc-1",
                    authorId: "user-123",
                    status: "pending",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    kind: "fix",
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const stripped = stripPendingSuggestionsExcept(doc, null);
    expect(collectPendingSuggestionMarkIds(stripped)).toEqual(["human-tc-1"]);
    expect(stripped).toEqual(doc);
  });
});

describe("richDocsMatchIgnoringAiPreview", () => {
  it("ignores editor-local AI insert previews when comparing docs", () => {
    const base: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "On 15/05/2025 at approximately 10:00 hrs." }],
        },
      ],
    };
    const withPreview = injectSuggestionMarks(
      base,
      {
        anchorText: "On 15/05/2025",
        deleteText: "",
        insertText: " extra",
      },
      {
        id: "suggestion-a",
        authorId: "ai",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
        kind: "fix",
      }
    ).doc;
    const persisted = stripPendingSuggestionsExcept(withPreview, null);

    expect(richDocsMatchIgnoringAiPreview(withPreview, persisted)).toBe(true);
    expect(
      richDocsMatchIgnoringAiPreview(withPreview, {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Different sentence." }],
          },
        ],
      })
    ).toBe(false);
  });
});

describe("shouldSkipSuggestionDocSync", () => {
  it("does not rewrite the focused editor after local typing", () => {
    expect(
      shouldSkipSuggestionDocSync({
        hasFocus: true,
        previewHeld: false,
        needsInject: false,
        hasLocalEdits: true,
      })
    ).toBe(true);
  });

  it("still injects a missing preview when the focused field is unchanged", () => {
    expect(
      shouldSkipSuggestionDocSync({
        hasFocus: true,
        previewHeld: false,
        needsInject: true,
        hasLocalEdits: false,
      })
    ).toBe(false);
  });

  it("does not inject over local edits even when the preview is missing", () => {
    expect(
      shouldSkipSuggestionDocSync({
        hasFocus: true,
        previewHeld: false,
        needsInject: true,
        hasLocalEdits: true,
      })
    ).toBe(true);
  });

  it("allows accept/dismiss preview-held rewrites while focused", () => {
    expect(
      shouldSkipSuggestionDocSync({
        hasFocus: true,
        previewHeld: true,
        needsInject: false,
        hasLocalEdits: true,
      })
    ).toBe(false);
  });
});

describe("shouldApplyExternalValueToEditor", () => {
  it("does not rewrite when the live doc already matches aside from AI preview marks", () => {
    expect(
      shouldApplyExternalValueToEditor({
        previewHeld: false,
        persistedChanged: true,
        hasFocus: false,
        docsMatchIgnoringPreview: true,
      })
    ).toBe(false);
  });

  it("does not replace the live preview with the pre-accept snapshot", () => {
    // Regression: preview-held flipped on, value still the old snapshot,
    // editor still showing insert/delete marks — applying that snapshot
    // made the proposed text vanish until the PATCH returned.
    expect(
      shouldApplyExternalValueToEditor({
        previewHeld: true,
        persistedChanged: false,
        hasFocus: true,
        docsMatchIgnoringPreview: false,
      })
    ).toBe(false);
  });

  it("applies the persisted result once accept/dismiss has written it", () => {
    expect(
      shouldApplyExternalValueToEditor({
        previewHeld: true,
        persistedChanged: true,
        hasFocus: true,
        docsMatchIgnoringPreview: false,
      })
    ).toBe(true);
  });

  it("does not replace the focused editor after local typing", () => {
    expect(
      shouldApplyExternalValueToEditor({
        previewHeld: false,
        persistedChanged: true,
        hasFocus: true,
        docsMatchIgnoringPreview: false,
      })
    ).toBe(false);
  });

  it("applies an unfocused external write", () => {
    expect(
      shouldApplyExternalValueToEditor({
        previewHeld: false,
        persistedChanged: true,
        hasFocus: false,
        docsMatchIgnoringPreview: false,
      })
    ).toBe(true);
  });
});
