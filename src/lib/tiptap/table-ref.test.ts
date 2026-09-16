// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { TableRef, insertTableRefFromPicker } from "@/lib/tiptap/table-ref";
import { isTableRefNode } from "@/lib/tiptap/table-ref-markdown";
import {
  SuggestionDelete,
  SuggestionInsert,
} from "@/lib/tiptap/suggestion-marks";

function makeEditor(content?: string) {
  return new Editor({
    element: document.createElement("div"),
    extensions: [
      StarterKit.configure({ heading: false }),
      TableRef,
      SuggestionInsert,
      SuggestionDelete,
    ],
    content: content
      ? {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: content ? [{ type: "text", text: content }] : [],
            },
          ],
        }
      : { type: "doc", content: [{ type: "paragraph" }] },
  });
}

function typeText(editor: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp("handleTextInput", (fn) =>
      fn(editor.view, from, to, ch)
    );
    if (!handled) {
      editor.view.dispatch(editor.state.tr.insertText(ch));
    }
  }
}

function paragraphNodes(editor: Editor) {
  return editor.getJSON().content?.[0]?.content ?? [];
}

describe("tableRef typing", () => {
  it("turns typed [[table]] into a tableRef atom", () => {
    const editor = makeEditor();
    typeText(editor, "See [[table]] here");
    const ref = paragraphNodes(editor).find(isTableRefNode);
    expect(ref?.attrs).toMatchObject({
      section: "",
      targetField: "",
      tableIndex: 0,
    });
    expect(editor.getText()).toContain("the table");
    editor.destroy();
  });

  it("parses [[table:Monitoring]] while typing", () => {
    const editor = makeEditor();
    typeText(editor, "See [[table:Monitoring]].");
    const ref = paragraphNodes(editor).find(isTableRefNode);
    expect(ref?.attrs).toMatchObject({
      section: "Monitoring",
      targetField: "",
      tableIndex: 0,
    });
    editor.destroy();
  });

  it("leaves typed Table 8 as plain text", () => {
    const editor = makeEditor();
    typeText(editor, "See Table 8.");
    expect(paragraphNodes(editor).some(isTableRefNode)).toBe(false);
    expect(editor.getText()).toBe("See Table 8.");
    editor.destroy();
  });

  it("inserts a picker selection at the cursor", () => {
    const editor = makeEditor();
    typeText(editor, "See ");
    const ok = insertTableRefFromPicker(editor, {
      section: "elr_monitoring",
      targetField: "table",
      tableIndex: 0,
      n: 2,
    });
    expect(ok).toBe(true);
    const ref = paragraphNodes(editor).find(isTableRefNode);
    expect(ref?.attrs).toMatchObject({
      section: "elr_monitoring",
      targetField: "table",
      tableIndex: 0,
      n: 2,
    });
    expect(editor.getText()).toContain("Table 2");
    editor.destroy();
  });
});
