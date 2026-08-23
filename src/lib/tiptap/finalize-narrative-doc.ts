import type { JSONContent } from "@tiptap/core";
import { keepEmptyParagraphBeforeCitationHeading } from "@/lib/suggestions/citations-at-end";
import { normalizeDocumentBracketPlaceholders } from "@/lib/placeholders/normalize-document-placeholders";
import { coalesceAdjacentTextNodes } from "@/lib/tiptap/coalesce-text-nodes";

/** Drop emptied top-level paragraphs/headings left after a cross-block delete. */
function dropEmptyBlocks(doc: JSONContent): JSONContent {
  if (!doc.content?.length) return doc;
  const next = doc.content.filter((block, index) => {
    if (keepEmptyParagraphBeforeCitationHeading(block, doc.content?.[index + 1])) {
      return true;
    }
    if (block.type === "paragraph" || block.type === "heading") {
      const text = (block.content ?? [])
        .map((c) => (c.type === "text" ? c.text ?? "" : ""))
        .join("");
      const hasNonText = (block.content ?? []).some(
        (c) => c.type !== "text" && c.type !== "hardBreak"
      );
      return hasNonText || text.length > 0;
    }
    return true;
  });
  return {
    ...doc,
    content: next.length > 0 ? next : [{ type: "paragraph" }],
  };
}

/** Run after accepting an AI suggestion so placeholders scan/highlight reliably. */
export function finalizeNarrativeDocAfterSuggestion(doc: JSONContent): JSONContent {
  return normalizeDocumentBracketPlaceholders(
    coalesceAdjacentTextNodes(dropEmptyBlocks(doc))
  );
}
