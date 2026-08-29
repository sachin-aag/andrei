/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Editor } from "@tiptap/core";
import {
  clipboardErrorMessage,
  copyEditorSelection,
  pasteEditorClipboard,
} from "./editor-clipboard";

function mockEditor(selectionEmpty: boolean): Editor {
  const dom = document.createElement("div");
  const deleteSelection = vi.fn(() => true);
  const insertContent = vi.fn(() => true);
  const chain = {
    focus: vi.fn(() => chain),
    deleteSelection,
    insertContent,
    run: vi.fn(() => true),
  };
  return {
    state: {
      selection: {
        empty: selectionEmpty,
        from: selectionEmpty ? 1 : 1,
        to: selectionEmpty ? 1 : 5,
        content: () => ({
          content: {
            textBetween: () => "hello",
          },
        }),
      },
      doc: {
        textBetween: () => "hello",
      },
    },
    schema: {
      marks: {},
      nodes: {
        doc: {
          create: () => ({ type: { name: "doc" } }),
          spec: { toDOM: () => ["div", 0] },
        },
        paragraph: {
          create: () => ({ type: { name: "paragraph" } }),
          spec: { toDOM: () => ["p", 0] },
        },
        text: {
          create: () => ({ type: { name: "text" } }),
          spec: { toDOM: (node: { text: string }) => node.text },
        },
      },
    },
    chain: vi.fn(() => chain),
    view: {
      focus: vi.fn(),
      dom,
    },
  } as unknown as Editor;
}

describe("editor-clipboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reports no_selection when copying without a range", async () => {
    const result = await copyEditorSelection(mockEditor(true));
    expect(result).toEqual({ ok: false, error: "no_selection" });
  });

  it("pastes plain text from the Clipboard API", async () => {
    const editor = mockEditor(true);
    const insertContent = vi.fn();
    const chain = {
      focus: vi.fn(function focus(this: typeof chain) {
        return this;
      }),
      insertContent,
      run: vi.fn(() => true),
    };
    insertContent.mockReturnValue(chain);
    vi.mocked(editor.chain).mockReturnValue(chain as never);

    const readText = vi.fn(async () => "pasted text");
    Object.assign(navigator, {
      clipboard: { readText },
    });

    const result = await pasteEditorClipboard(editor);
    expect(result).toEqual({ ok: true });
    expect(readText).toHaveBeenCalled();
    expect(insertContent).toHaveBeenCalledWith("pasted text");
  });

  it("maps clipboard permission errors to a helpful message", () => {
    expect(clipboardErrorMessage("permission_denied")).toContain("Ctrl+V");
  });
});
