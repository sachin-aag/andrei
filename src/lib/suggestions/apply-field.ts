import { normalizeBracketPlaceholdersInPlainText } from "@/lib/placeholders/normalize-bracket-placeholders";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import { stripInlineMarkdown } from "@/lib/tiptap/markdown-to-doc";
import {
  applyEditToPlainText,
  isApplyableStatus,
  type SuggestionEdit,
} from "./locator";

function plainInsertText(insertText: string): string {
  return stripInlineMarkdown(normalizeSuggestionInsertText(insertText));
}

/** Apply structured-field suggestion via dot-path (e.g. correctiveActions). */
export function applyStructuredFieldSuggestion(
  content: Record<string, unknown>,
  targetField: string,
  insertText: string,
  deleteText: string,
  anchorText?: string | null,
  second?: SuggestionEdit["second"]
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
    const primary = plainInsertText(insertText);
    const cite = second?.insertText ? plainInsertText(second.insertText) : "";
    cursor[leaf] = cite ? `${primary}${primary ? "\n" : ""}${cite}` : primary;
    return next;
  }

  const applied = applyEditToPlainText(current, {
    anchorText: anchorText?.trim() ?? "",
    deleteText,
    insertText: plainInsertText(insertText),
    second: second
      ? {
          anchorText: second.anchorText,
          deleteText: second.deleteText,
          insertText: plainInsertText(second.insertText),
          scope: second.scope,
        }
      : undefined,
  });

  if (!isApplyableStatus(applied.status)) {
    throw new Error("Suggestion could not be located in field text");
  }

  cursor[leaf] = normalizeBracketPlaceholdersInPlainText(applied.text);
  return next;
}
