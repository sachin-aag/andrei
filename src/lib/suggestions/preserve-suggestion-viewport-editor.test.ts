// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  SuggestionInsert,
  SuggestionDelete,
} from "@/lib/tiptap/suggestion-marks";
import { acceptSuggestionMarksById } from "@/lib/tiptap/suggestion-inject";
import { setRichEditorContentPreservingViewport } from "@/lib/suggestions/preserve-suggestion-viewport";
import type { JSONContent } from "@tiptap/core";

const MARK_ID = "sug-large";

function makeEditor(content: JSONContent) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({ heading: false }),
      SuggestionInsert,
      SuggestionDelete,
    ],
    content,
  });
}

function previewDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "OLD ".repeat(40),
            marks: [
              {
                type: "suggestionDelete",
                attrs: {
                  id: MARK_ID,
                  authorId: "ai",
                  status: "pending",
                  createdAt: "2026-01-01T00:00:00.000Z",
                  kind: "fix",
                },
              },
            ],
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "NEW green insert that should stay on screen. ".repeat(20),
            marks: [
              {
                type: "suggestionInsert",
                attrs: {
                  id: MARK_ID,
                  authorId: "ai",
                  status: "pending",
                  createdAt: "2026-01-01T00:00:00.000Z",
                  kind: "fix",
                },
              },
            ],
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Trailing paragraph after the edit." }],
      },
    ],
  };
}

describe("setRichEditorContentPreservingViewport", () => {
  it("places the caret on the green insert, not at the end of the field", () => {
    const preview = previewDoc();
    const editor = makeEditor(preview);
    editor.view.dom.focus();
    const accepted = acceptSuggestionMarksById(preview, MARK_ID);

    setRichEditorContentPreservingViewport(editor, accepted, {
      pinSuggestionId: MARK_ID,
      pinKind: "insert",
    });

    const { from } = editor.state.selection;
    const end = editor.state.doc.content.size;
    const text = editor.state.doc.textBetween(from, Math.min(from + 20, end), " ");
    expect(from).toBeLessThan(end - 10);
    expect(text.startsWith("NEW green")).toBe(true);

    editor.destroy();
  });

  it("keeps a prior caret when rewriting without a pin id", () => {
    const preview = previewDoc();
    const editor = makeEditor(preview);
    editor.view.dom.focus();
    const insertPos = 1 + "OLD ".repeat(40).length + 2;
    editor.commands.setTextSelection(insertPos);
    const accepted = acceptSuggestionMarksById(preview, MARK_ID);

    setRichEditorContentPreservingViewport(editor, accepted);

    expect(editor.state.selection.from).toBeLessThan(
      editor.state.doc.content.size - 10
    );

    editor.destroy();
  });

  it("does not steal focus when rewriting an unfocused editor", () => {
    const preview = previewDoc();
    const editor = makeEditor(preview);
    const other = document.createElement("textarea");
    document.body.append(other);
    other.focus();
    expect(document.activeElement).toBe(other);

    setRichEditorContentPreservingViewport(editor, preview, {
      pinSuggestionId: MARK_ID,
      pinKind: "insert",
    });

    expect(document.activeElement).toBe(other);
    expect(editor.view.hasFocus()).toBe(false);

    editor.destroy();
    other.remove();
  });

  it("plain setContent maps the caret to the end of a large replace", () => {
    const preview = previewDoc();
    const editor = makeEditor(preview);
    const accepted = acceptSuggestionMarksById(preview, MARK_ID);

    editor.commands.setContent(accepted, { emitUpdate: false });

    // Full-document replace maps the prior selection with assoc +1, so the
    // caret lands at the last position — the trailing paragraph / next section.
    expect(editor.state.selection.from).toBeGreaterThan(
      editor.state.doc.content.size - 5
    );

    editor.destroy();
  });
});
