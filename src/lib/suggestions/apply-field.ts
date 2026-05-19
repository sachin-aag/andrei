import { normalizeBracketPlaceholdersInPlainText } from "@/lib/placeholders/normalize-bracket-placeholders";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import { applyPlainTextEdit } from "./locate-plain-text-edit";

/** Apply structured-field suggestion via dot-path (e.g. correctiveActions). */
export function applyStructuredFieldSuggestion(
  content: Record<string, unknown>,
  targetField: string,
  insertText: string,
  deleteText: string,
  anchorText?: string | null
): Record<string, unknown> {
  const next = structuredClone(content);
  const parts = targetField.split(".");
  let cursor: Record<string, unknown> = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const child = cursor[key];
    if (!child || typeof child !== "object" || Array.isArray(child)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1]!;
  const current = cursor[leaf];
  if (typeof current !== "string") {
    cursor[leaf] = normalizeSuggestionInsertText(insertText);
    return next;
  }

  const applied = applyPlainTextEdit(current, {
    anchorText: anchorText?.trim() ?? "",
    deleteText,
    insertText: normalizeSuggestionInsertText(insertText),
  });

  if (applied === null) {
    throw new Error("Suggestion could not be located in field text");
  }

  cursor[leaf] = normalizeBracketPlaceholdersInPlainText(applied);
  return next;
}
