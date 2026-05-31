import { MAMMOTH_SOFT_BREAK } from "@/lib/tiptap/rich-text";
import { stripWordBookmarkAnchors } from "@/lib/import/sanitize-import-html";

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function labelPattern(labels: string): string {
  return `${escapeRegex(labels)}(?![A-Za-z0-9_])(?:[ \\t]*\\([^)]*\\))?[ \\t]*:?[ \\t]*`;
}

/** Reverses mammoth's markdown escaper so import text matches readable prose. */
function unescapeMammothMarkdownEscapes(text: string): string {
  return text.replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1");
}

const MAMMOTH_MARKDOWN_IMAGE_RE = /!\[[^\]\n]*\]\((?:data:image\/[^)\s]+|[^)\n]+)\)/gi;

/**
 * Mammoth's convertToMarkdown keeps Word list numbering as "1. …", "2. …".
 * extractRawText drops those numbers because they are not stored as paragraph text.
 */
export function mammothMarkdownToImportPlain(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const normalized = lines.map((line) => {
    const softBreak = /  +$/.test(line);
    const withoutBold = line.replace(/__([\s\S]*?)__/g, "$1").trimEnd();
    const withImagePlaceholders = withoutBold.replace(MAMMOTH_MARKDOWN_IMAGE_RE, "[image]");
    const unescaped = unescapeMammothMarkdownEscapes(withImagePlaceholders);
    const stripped = stripWordBookmarkAnchors(unescaped);
    return softBreak ? `${stripped}${MAMMOTH_SOFT_BREAK}` : stripped;
  });
  return normalized.join("\n");
}

export function cleanImportedText(text: string): string {
  return text
    .replace(/\{[#/][^}]+\}/g, "")
    .replace(/\{[^}]+\}/g, "")
    .replace(/\r/g, "")
    .replace(new RegExp(MAMMOTH_SOFT_BREAK, "g"), "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Narrative import: preserve mammoth soft-break markers for linesToDoc/hardBreak. */
export function cleanImportedNarrativeText(text: string): string {
  return text
    .replace(/\{[#/][^}]+\}/g, "")
    .replace(/\{[^}]+\}/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function findLabel(text: string, labels: string[], from = 0): RegExpExecArray | null {
  const alt = labels.map(labelPattern).join("|");
  const re = new RegExp(`^[ \\t]*(?:${alt})`, "gim");
  re.lastIndex = from;
  return re.exec(text);
}

export function getBetweenLabels(
  text: string,
  startLabels: string[],
  stopLabels: string[]
): string {
  const start = findLabel(text, startLabels);
  if (!start) return "";

  const startIndex = start.index + start[0].length;
  let endIndex = text.length;
  for (const stop of stopLabels) {
    const match = findLabel(text, [stop], startIndex);
    if (match && match.index < endIndex) endIndex = match.index;
  }

  return cleanImportedText(text.slice(startIndex, endIndex));
}

export function hasLabel(text: string, labels: string[]): boolean {
  return findLabel(text, labels) !== null;
}

export function getLineValueMaybe(text: string, label: string): string | null {
  const re = new RegExp(`^[ \\t]*${labelPattern(label)}(.*)$`, "im");
  const match = re.exec(text);
  return match ? cleanImportedText(match[1] ?? "") : null;
}

export function getLineValue(text: string, label: string): string {
  return getLineValueMaybe(text, label) ?? "";
}

export function findInlineLabel(text: string, label: string, from = 0): RegExpExecArray | null {
  const re = new RegExp(labelPattern(label), "gi");
  re.lastIndex = from;
  return re.exec(text);
}

export function getInlineBetweenLabel(
  text: string,
  startLabel: string,
  stopLabels: string[]
): string {
  const start = findInlineLabel(text, startLabel);
  if (!start) return "";

  const startIndex = start.index + start[0].length;
  let endIndex = text.length;
  for (const stop of stopLabels) {
    const match = findInlineLabel(text, stop, startIndex);
    if (match && match.index < endIndex) endIndex = match.index;
  }

  return cleanImportedText(text.slice(startIndex, endIndex));
}

export function textBeforeAnyInlineLabel(text: string, labels: string[]): string {
  let endIndex = text.length;
  for (const label of labels) {
    const match = findInlineLabel(text, label);
    if (match && match.index < endIndex) endIndex = match.index;
  }
  return cleanImportedText(text.slice(0, endIndex));
}

/** Line-anchored variant — avoids splitting on label phrases inside checklist questions. */
export function textBeforeAnyLabel(text: string, labels: string[]): string {
  let endIndex = text.length;
  for (const label of labels) {
    const match = findLabel(text, [label]);
    if (match && match.index < endIndex) endIndex = match.index;
  }
  return cleanImportedText(text.slice(0, endIndex));
}

export function normalizedSearchIndex(haystack: string, needle: string): number {
  const normalizedChars: string[] = [];
  const rawOffsets: number[] = [];
  let lastWasSpace = false;

  for (let i = 0; i < haystack.length; i++) {
    const ch = haystack[i]!;
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        normalizedChars.push(" ");
        rawOffsets.push(i);
        lastWasSpace = true;
      }
      continue;
    }
    normalizedChars.push(ch.toLowerCase());
    rawOffsets.push(i);
    lastWasSpace = false;
  }

  const normalizedNeedle = needle.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalizedNeedle) return -1;
  const idx = normalizedChars.join("").indexOf(normalizedNeedle);
  return idx === -1 ? -1 : rawOffsets[idx] ?? -1;
}
