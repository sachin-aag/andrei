// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { fillPlaceholder } from "./fill";
import { findPlaceholdersInPmDoc } from "./find";

describe("fillPlaceholder", () => {
  it("replaces the token without focusing the editor", () => {
    const token = "[Protocol: <to be filled>]";
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [StarterKit],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: `and TOP-00051 systems ${token}. Datasheets attached.`,
              },
            ],
          },
        ],
      },
    });

    const placeholder = findPlaceholdersInPmDoc(
      editor.state.doc,
      "define",
      "narrative"
    ).find((p) => p.text === token);
    expect(placeholder).toBeDefined();

    const ok = fillPlaceholder(editor, placeholder!, "790-00134 Rev U");
    expect(ok).toBe(true);
    expect(editor.isFocused).toBe(false);
    expect(editor.getText()).toContain("790-00134 Rev U");
    expect(editor.getText()).not.toContain("to be filled");

    editor.destroy();
  });
});
