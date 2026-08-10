import { hasSupportedAttachmentExtension } from "@/lib/attachments/file-types";

/** Citation-style `[12]` — not a fill-in placeholder. */
const NUMERIC_ONLY_BRACKET = /^\[\s*\d+\s*\]$/;

const LABEL_THEN_TO_BE_FILLED =
  /^(.*?)\s*:\s*(?:<\s*)?to\s+be\s+filled(?:\s*>)?\s*$/i;

/** Trailing mistaken filler after a cite list, e.g. `; <to be filled>` / `, to be filled`. */
const TRAILING_TO_BE_FILLED_JUNK =
  /[,;:\s]*(?:<\s*)?to\s+be\s+filled(?:\s*>)?\s*$/i;

/** `[filename, p. N]` / `[filename, p.N]` page citation suffix. */
const PAGE_CITE_SUFFIX = /,\s*p\.\s*\d+\s*$/i;

/**
 * Extension-less exhibit labels: `Attachment I`, `Attachment_XIV`, `Attachment-21`.
 * Used when AI cites by exhibit id instead of filename + extension.
 */
const ATTACHMENT_LABEL = /^Attachment[_\s-]?([IVXLCDM]+|\d+)$/i;

/**
 * Core citation text: strip a mistaken `: <to be filled>` wrapper the AI /
 * old normalizer may have added around a document cite, plus leftover
 * `; <to be filled>` junk after multi-cite lists.
 */
function citationCoreFromInner(inner: string): string {
  const labeled = LABEL_THEN_TO_BE_FILLED.exec(inner);
  let core = (labeled?.[1] ?? inner).trim();
  core = core.replace(TRAILING_TO_BE_FILLED_JUNK, "").trim();
  core = core.replace(/[,;]+$/, "").trim();
  return core;
}

/** True when `core` is one or more Attachment_XIV-style exhibit labels. */
function isAttachmentLabelCite(core: string): boolean {
  const withoutPage = core.replace(PAGE_CITE_SUFFIX, "").trim();
  if (!withoutPage) return false;
  const parts = withoutPage
    .split(/\s*,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => ATTACHMENT_LABEL.test(p));
}

/**
 * True when `[...]` is a document citation, not a Placeholders-panel token.
 *
 * Recognizes:
 * - numeric `[12]`
 * - page cites `[name, p. N]` (any name; extension optional)
 * - bare attachment filenames using supported extensions from file-types
 * - extension-less exhibit labels (`[Attachment_XIV]`, lists, optional page)
 * - mistaken `[cite: <to be filled>]` / `[cite,; <to be filled>]` wrappers
 */
export function isCitationShapedBracket(match: string): boolean {
  if (!/^\[[^\]]+\]$/.test(match)) return false;
  if (NUMERIC_ONLY_BRACKET.test(match)) return true;

  const core = citationCoreFromInner(match.slice(1, -1));
  if (!core) return false;
  if (PAGE_CITE_SUFFIX.test(core)) return true;
  if (isAttachmentLabelCite(core)) return true;
  return hasSupportedAttachmentExtension(core);
}

/**
 * If `match` is a citation wrongly wrapped as `[cite: <to be filled>]`
 * (or with trailing `; <to be filled>` junk), return the repaired `[cite]`;
 * otherwise null.
 */
export function repairedCitationBracket(match: string): string | null {
  if (!/^\[[^\]]+\]$/.test(match)) return null;
  const inner = match.slice(1, -1).trim();
  const core = citationCoreFromInner(inner);
  if (!core || core === inner) return null;
  if (!isCitationShapedBracket(`[${core}]`)) return null;
  return `[${core}]`;
}
