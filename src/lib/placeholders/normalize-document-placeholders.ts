import type { JSONContent } from "@tiptap/core";
import { normalizeBracketPlaceholdersInPlainText } from "./normalize-bracket-placeholders";

/** Normalize bracket placeholder tokens in every text node of a Tiptap doc. */
export function normalizeDocumentBracketPlaceholders(doc: JSONContent): JSONContent {
  const cloned: JSONContent = JSON.parse(JSON.stringify(doc));

  function visit(node: JSONContent) {
    if (node.type === "text" && node.text) {
      node.text = normalizeBracketPlaceholdersInPlainText(node.text);
    }
    node.content?.forEach(visit);
  }

  visit(cloned);
  return cloned;
}
