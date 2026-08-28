import type { Editor } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";

export type EditorClipboardError =
  | "no_selection"
  | "clipboard_unavailable"
  | "permission_denied"
  | "empty_clipboard";

export function editorHasSelection(editor: Editor): boolean {
  const { from, to } = editor.state.selection;
  return from !== to;
}

export function focusEditorView(editor: Editor): void {
  editor.view.focus();
}

function selectionHtml(editor: Editor): string {
  const serializer = DOMSerializer.fromSchema(editor.schema);
  const fragment = editor.state.selection.content().content;
  const container = document.createElement("div");
  container.appendChild(serializer.serializeFragment(fragment));
  return container.innerHTML;
}

async function writeSelectionToClipboard(editor: Editor): Promise<boolean> {
  const { from, to } = editor.state.selection;
  if (from === to) return false;

  const text = editor.state.doc.textBetween(from, to, "\n");
  const html = selectionHtml(editor);

  if (typeof navigator !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return true;
    } catch {
      // Fall through to execCommand.
    }
  }

  focusEditorView(editor);
  return document.execCommand("copy");
}

export async function copyEditorSelection(
  editor: Editor
): Promise<{ ok: true } | { ok: false; error: EditorClipboardError }> {
  if (!editorHasSelection(editor)) {
    return { ok: false, error: "no_selection" };
  }
  const copied = await writeSelectionToClipboard(editor);
  return copied ? { ok: true } : { ok: false, error: "clipboard_unavailable" };
}

export async function cutEditorSelection(
  editor: Editor
): Promise<{ ok: true } | { ok: false; error: EditorClipboardError }> {
  if (!editorHasSelection(editor)) {
    return { ok: false, error: "no_selection" };
  }
  const copied = await writeSelectionToClipboard(editor);
  if (!copied) {
    return { ok: false, error: "clipboard_unavailable" };
  }
  const deleted = editor.chain().focus().deleteSelection().run();
  return deleted ? { ok: true } : { ok: false, error: "clipboard_unavailable" };
}

type ClipboardPayload = {
  html: string;
  text: string;
};

async function readClipboardPayload(): Promise<ClipboardPayload | null> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return null;
  }

  let html = "";
  let text = "";

  if (navigator.clipboard.read) {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes("text/html")) {
          html = await (await item.getType("text/html")).text();
        }
        if (item.types.includes("text/plain")) {
          text = await (await item.getType("text/plain")).text();
        }
      }
      if (html.trim() || text) {
        return { html, text };
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        throw error;
      }
      // Fall through to readText.
    }
  }

  try {
    text = await navigator.clipboard.readText();
    if (!text) return null;
    return { html: "", text };
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw error;
    }
    return null;
  }
}

function clipboardPayloadToDataTransfer(payload: ClipboardPayload): DataTransfer {
  const data = new DataTransfer();
  if (payload.html.trim()) data.setData("text/html", payload.html);
  if (payload.text) data.setData("text/plain", payload.text);
  return data;
}

function dispatchPasteEvent(editor: Editor, payload: ClipboardPayload): boolean {
  focusEditorView(editor);
  try {
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboardPayloadToDataTransfer(payload),
    });
    return editor.view.dom.dispatchEvent(event);
  } catch {
    return false;
  }
}

function insertClipboardPayload(editor: Editor, payload: ClipboardPayload): boolean {
  if (payload.html.trim()) {
    return editor.chain().focus().insertContent(payload.html).run();
  }
  if (payload.text) {
    return editor.chain().focus().insertContent(payload.text).run();
  }
  return false;
}

export async function pasteEditorClipboard(
  editor: Editor
): Promise<{ ok: true } | { ok: false; error: EditorClipboardError }> {
  let payload: ClipboardPayload | null;
  try {
    payload = await readClipboardPayload();
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      return { ok: false, error: "permission_denied" };
    }
    return { ok: false, error: "clipboard_unavailable" };
  }

  if (!payload || (!payload.html.trim() && !payload.text)) {
    return { ok: false, error: "empty_clipboard" };
  }

  const pasted =
    dispatchPasteEvent(editor, payload) ||
    insertClipboardPayload(editor, payload);
  return pasted ? { ok: true } : { ok: false, error: "clipboard_unavailable" };
}

export function deleteEditorSelection(editor: Editor): boolean {
  if (!editorHasSelection(editor)) return false;
  return editor.chain().focus().deleteSelection().run();
}

export function clipboardErrorMessage(error: EditorClipboardError): string {
  switch (error) {
    case "permission_denied":
      return "Allow clipboard access to paste from the menu, or use Ctrl+V / ⌘V.";
    case "empty_clipboard":
      return "Nothing to paste.";
    case "no_selection":
      return "Select text first.";
    case "clipboard_unavailable":
      return "Clipboard is not available in this browser.";
  }
}
