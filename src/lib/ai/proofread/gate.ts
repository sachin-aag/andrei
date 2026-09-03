import {
  locateEdit,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";

const CONTEXT_RADIUS = 40;
const SHORT_DELETE_CHARS = 12;

export function contextAnchor(
  text: string,
  deleteStart: number,
  deleteEnd: number,
  radius = CONTEXT_RADIUS
): string {
  const start = Math.max(0, deleteStart - radius);
  const end = Math.min(text.length, deleteEnd + radius);
  return text.slice(start, end);
}

export function gateProofreadEdit(
  unitText: string,
  edit: Pick<SuggestionEdit, "deleteText" | "insertText" | "anchorText">
): { ok: true; edit: SuggestionEdit } | { ok: false } {
  const deleteText = (edit.deleteText ?? "").trim();
  const insertText = edit.insertText ?? "";
  if (!deleteText) return { ok: false };
  if (deleteText === insertText) return { ok: false };

  const located = locateEdit(unitText, {
    anchorText: (edit.anchorText ?? "").trim(),
    deleteText,
    insertText,
  });
  if (located.status !== "located") {
    const fallback = locateEdit(unitText, {
      anchorText: "",
      deleteText,
      insertText,
    });
    if (fallback.status !== "located") return { ok: false };
    const anchor =
      deleteText.length < SHORT_DELETE_CHARS
        ? contextAnchor(unitText, fallback.deleteStart, fallback.deleteEnd)
        : deleteText;
    return {
      ok: true,
      edit: { anchorText: anchor, deleteText, insertText },
    };
  }

  const uniqueCheck = locateEdit(unitText, {
    anchorText: "",
    deleteText,
    insertText,
  });
  const needsContext =
    uniqueCheck.status === "ambiguous" || deleteText.length < SHORT_DELETE_CHARS;
  const anchor = needsContext
    ? contextAnchor(unitText, located.deleteStart, located.deleteEnd)
    : (edit.anchorText ?? "").trim() || deleteText;

  return {
    ok: true,
    edit: { anchorText: anchor, deleteText, insertText },
  };
}
