import {
  isAiSuggestionKind,
  parseAiFixCommentContent,
  parseAiRedraftCommentContent,
} from "@/lib/ai/suggestion-gating";
import { markdownToPlainText } from "@/lib/tiptap/markdown-to-doc";

type ExportableComment = { kind: string; content: string };

/** Normalize leading list markers for readable Word comment text. */
function normalizeBullets(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^(\s*)[-*]\s+/, "$1• "))
    .join("\n");
}

function formatAiFixForExport(content: string): string {
  const payload = parseAiFixCommentContent(content);
  const deleteText = payload.deleteText.trim();
  const insertText = payload.insertText.trim();
  const reasoning = payload.reasoning.trim();

  const lines: string[] = [];
  if (reasoning) lines.push(reasoning);

  if (deleteText && insertText) {
    lines.push(`Suggested change: "${deleteText}" → "${insertText}"`);
  } else if (insertText) {
    lines.push(`Suggested insertion: "${insertText}"`);
  } else if (deleteText) {
    lines.push(`Suggested deletion: "${deleteText}"`);
  }

  return lines.join("\n");
}

function formatAiRedraftForExport(content: string): string {
  const payload = parseAiRedraftCommentContent(content);
  const reasoning = payload.reasoning.trim();
  const body = normalizeBullets(markdownToPlainText(payload.markdown));

  const lines: string[] = [];
  if (reasoning) lines.push(reasoning);
  if (body) lines.push(body);
  return lines.join("\n");
}

/**
 * Full, human-readable comment body for Word export.
 * Unlike display.ts previews, this does not truncate.
 */
export function formatCommentForExport(comment: ExportableComment): string {
  if (!isAiSuggestionKind(comment.kind)) {
    return comment.content;
  }
  switch (comment.kind) {
    case "ai_redraft":
      return formatAiRedraftForExport(comment.content);
    case "ai_fix":
      return formatAiFixForExport(comment.content);
    default: {
      const _exhaustive: never = comment.kind;
      return _exhaustive;
    }
  }
}
