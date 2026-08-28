import type { Editor } from "@tiptap/core";

export function editorHasSelection(editor: Editor): boolean {
  const { from, to } = editor.state.selection;
  return from !== to;
}

export function focusEditorView(editor: Editor): void {
  editor.view.focus();
}

/** Uses the browser clipboard integration while the editor view is focused. */
export function runEditorClipboardCommand(
  editor: Editor,
  command: "cut" | "copy" | "paste"
): boolean {
  focusEditorView(editor);
  return document.execCommand(command);
}

export function deleteEditorSelection(editor: Editor): boolean {
  if (!editorHasSelection(editor)) return false;
  return editor.chain().focus().deleteSelection().run();
}
