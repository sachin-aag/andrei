import type { JSONContent } from "@tiptap/core";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import { collectPlaceholderSpans } from "@/lib/placeholders/find";
import { hashProofreadText } from "@/lib/proofread/hash";

export const PROOFREAD_MIN_WORDS = 3;

export type ProofreadFieldUnit = {
  id: string;
  text: string;
  hash: string;
};

const BLOCK_TYPES = new Set(["paragraph", "heading"]);
const SKIP_TYPES = new Set(["table", "imageInline", "mathInline", "mathBlock"]);

function inlineText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(inlineText).join("");
}

function hasSuggestionMarks(node: JSONContent): boolean {
  const marks = node.marks ?? [];
  if (
    marks.some(
      (mark) =>
        mark.type === suggestionInsertMarkName ||
        mark.type === suggestionDeleteMarkName
    )
  ) {
    return true;
  }
  return (node.content ?? []).some(hasSuggestionMarks);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function isPlaceholderHeavy(text: string): boolean {
  const spans = collectPlaceholderSpans(text);
  if (spans.length === 0) return false;
  const covered = spans.reduce((sum, span) => sum + span.text.length, 0);
  const stripped = text.replace(/\s+/g, "");
  if (stripped.length === 0) return true;
  return covered / Math.max(text.length, 1) >= 0.7;
}

export function shouldSkipProofreadUnit(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (wordCount(trimmed) < PROOFREAD_MIN_WORDS) return true;
  if (isPlaceholderHeavy(trimmed)) return true;
  return false;
}

export function collectProofreadUnits(doc: JSONContent): ProofreadFieldUnit[] {
  const units: ProofreadFieldUnit[] = [];

  function walk(node: JSONContent): void {
    if (!node) return;
    if (node.type && SKIP_TYPES.has(node.type)) return;
    if (node.type && BLOCK_TYPES.has(node.type)) {
      if (hasSuggestionMarks(node)) return;
      const text = inlineText(node).trim();
      if (shouldSkipProofreadUnit(text)) return;
      units.push({
        id: `p-${units.length}`,
        text,
        hash: hashProofreadText(text),
      });
      return;
    }
    for (const child of node.content ?? []) walk(child);
  }

  walk(doc);
  return units;
}

export function dirtyProofreadUnits(
  units: ProofreadFieldUnit[],
  cachedHashes: Set<string>
): ProofreadFieldUnit[] {
  return units.filter((unit) => !cachedHashes.has(unit.hash));
}
