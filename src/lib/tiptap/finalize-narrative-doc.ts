import type { JSONContent } from "@tiptap/core";
import { normalizeDocumentBracketPlaceholders } from "@/lib/placeholders/normalize-document-placeholders";
import { coalesceAdjacentTextNodes } from "@/lib/tiptap/coalesce-text-nodes";

/** Run after accepting an AI suggestion so placeholders scan/highlight reliably. */
export function finalizeNarrativeDocAfterSuggestion(doc: JSONContent): JSONContent {
  return normalizeDocumentBracketPlaceholders(coalesceAdjacentTextNodes(doc));
}
