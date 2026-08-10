import { hasSupportedAttachmentExtension } from "@/lib/attachments/file-types";

/** Citation-style `[12]` — not a fill-in placeholder. */
const NUMERIC_ONLY_BRACKET = /^\[\s*\d+\s*\]$/;

const LABEL_THEN_TO_BE_FILLED =
  /^(.*?)\s*:\s*(?:<\s*)?to\s+be\s+filled(?:\s*>)?\s*$/i;

/** `[filename, p. N]` / `[filename, p.N]` page citation suffix. */
const PAGE_CITE_SUFFIX = /,\s*p\.\s*\d+\s*$/i;

/**
 * Core citation text: strip a mistaken `: <to be filled>` wrapper the AI /
 * old normalizer may have added around a document cite.
 */
function citationCoreFromInner(inner: string): string {
  const labeled = LABEL_THEN_TO_BE_FILLED.exec(inner);
  return (labeled?.[1] ?? inner).trim();
}

/**
 * True when `[...]` is a document citation, not a Placeholders-panel token.
 *
 * Recognizes:
 * - numeric `[12]`
 * - page cites `[name, p. N]` (any name; extension optional)
 * - bare attachment filenames using supported extensions from file-types
 * - mistaken `[filename: <to be filled>]` / `[filename, p. N: <to be filled>]`
 */
export function isCitationShapedBracket(match: string): boolean {
  if (!/^\[[^\]]+\]$/.test(match)) return false;
  if (NUMERIC_ONLY_BRACKET.test(match)) return true;

  const core = citationCoreFromInner(match.slice(1, -1));
  if (!core) return false;
  if (PAGE_CITE_SUFFIX.test(core)) return true;
  return hasSupportedAttachmentExtension(core);
}

/**
 * If `match` is a citation wrongly wrapped as `[cite: <to be filled>]`,
 * return the repaired `[cite]`; otherwise null.
 */
export function repairedCitationBracket(match: string): string | null {
  if (!/^\[[^\]]+\]$/.test(match)) return null;
  const inner = match.slice(1, -1);
  const labeled = LABEL_THEN_TO_BE_FILLED.exec(inner);
  if (!labeled) return null;
  const label = labeled[1]?.trim() ?? "";
  if (!label) return null;
  if (!isCitationShapedBracket(`[${label}]`)) return null;
  return `[${label}]`;
}
