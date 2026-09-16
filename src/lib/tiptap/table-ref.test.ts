// @vitest-environment jsdom

import { Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { TableRef, insertTableRefFromPicker } from "@/lib/tiptap/table-ref";
import { isTableRefNode } from "@/lib/tiptap/table-ref-markdown";
import {
  SuggestionDelete,
  SuggestionInsert,
} from "@/lib/tiptap/suggestion-marks";

function makeEditor() {
  return new Editor({
    element: document.createElement("div"),
    extensions: [
      StarterKit.configure({ heading: false }),
      TableRef,
      SuggestionInsert,
      SuggestionDelete,
    ],
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
}

function typeText(editor: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp("handleTextInput", (fn) =>
      fn(editor.view, from, to, ch, () => editor.state.tr)
    );
    if (!handled) {
      editor.view.dispatch(editor.state.tr.insertText(ch));
    }
  }
}

function paragraphNodes(editor: Editor): JSONContent[] {
  const content = editor.getJSON().content?.[0]?.content;
  return Array.isArray(content) ? content : [];
}

function tableRefInEditor(editor: Editor): JSONContent | undefined {
  return paragraphNodes(editor).find((node) => isTableRefNode(node));
}

describe("tableRef typing", () => {
  it("turns typed [[table]] into a tableRef atom", () => {
    const editor = makeEditor();
    typeText(editor, "See [[table]] here");
    expect(tableRefInEditor(editor)?.attrs).toMatchObject({
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
    expect(tableRefInEditor(editor)?.attrs).toMatchObject({
      section: "Monitoring",
      targetField: "",
      tableIndex: 0,
    });
    editor.destroy();
  });

  it("leaves typed Table 8 as plain text", () => {
    const editor = makeEditor();
    typeText(editor, "See Table 8.");
    expect(tableRefInEditor(editor)).toBeUndefined();
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
    expect(tableRefInEditor(editor)?.attrs).toMatchObject({
      section: "elr_monitoring",
      targetField: "table",
      tableIndex: 0,
      n: 2,
    });
    expect(editor.getText()).toContain("Table 2");
    editor.destroy();
  });
});
