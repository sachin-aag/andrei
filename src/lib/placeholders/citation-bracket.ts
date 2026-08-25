import { hasSupportedAttachmentExtension } from "@/lib/attachments/file-types";

/** Citation-style `[12]` — not a fill-in placeholder. */
export const NUMERIC_ONLY_BRACKET = /^\[\s*\d+\s*\]$/;

/** True when `[...]` is a numeric citation marker such as `[3]`. */
export function isNumericCitationMarker(match: string): boolean {
  return NUMERIC_ONLY_BRACKET.test(match);
}

/** Number inside `[3]`, or null when the span is not a numeric marker. */
export function citationNumberFromMarker(match: string): number | null {
  const matched = /^\[\s*(\d+)\s*\]$/.exec(match);
  if (!matched) return null;
  return Number(matched[1]);
}

/** Document source cite (`[file.pdf, p. N]`), not a numeric `[3]` marker. */
export function isSourceCitationBracket(match: string): boolean {
  return isCitationShapedBracket(match) && !isNumericCitationMarker(match);
}

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
 * `Appendix B`, `Appendix B.1`, `Appendix 2`, `Appendix IV` — not
 * `Appendix number` / `Appendix name` (those are fill-in labels).
 */
const APPENDIX_LABEL =
  /^Appendix\s+(?:[A-Z](?:\.\d+)*|[IVXLCDM]{2,}|\d+)\b/i;

/**
 * Pharma / QMS document numbers such as `790-00134R` or `790-00134R(RevU)`.
 * Requires 3+ digits, hyphen, 4+ digits so ranges like `12-34` and dates
 * like `2024-01-15` are not treated as cites.
 */
const DOCUMENT_NUMBER = /\b\d{3,}-\d{4,}[A-Z]?\b/i;

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

function citeCoreWithoutPage(core: string): string {
  return core.replace(PAGE_CITE_SUFFIX, "").trim();
}

/** True when `core` is one or more Attachment_XIV-style exhibit labels. */
function isAttachmentLabelCite(core: string): boolean {
  const withoutPage = citeCoreWithoutPage(core);
  if (!withoutPage) return false;
  const parts = withoutPage
    .split(/\s*,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => ATTACHMENT_LABEL.test(p));
}

/** True when `core` names a specific appendix (optionally plus report title). */
function isAppendixCite(core: string): boolean {
  return APPENDIX_LABEL.test(citeCoreWithoutPage(core));
}

/** True when `core` contains a document number such as `790-00134R`. */
function isDocumentNumberCite(core: string): boolean {
  return DOCUMENT_NUMBER.test(citeCoreWithoutPage(core));
}

/**
 * True when `[...]` is a document citation, not a Placeholders-panel token.
 *
 * Recognizes:
 * - numeric `[12]`
 * - page cites `[name, p. N]` (any name; extension optional)
 * - bare attachment filenames using supported extensions from file-types
 * - extension-less exhibit labels (`[Attachment_XIV]`, lists, optional page)
 * - appendix / report-number cites (`[Appendix B]`,
 *   `[Appendix B DV Report 790-00134R(RevU)]`)
 * - mistaken `[cite: <to be filled>]` / `[cite,; <to be filled>]` wrappers
 */
export function isCitationShapedBracket(match: string): boolean {
  if (!/^\[[^\]]+\]$/.test(match)) return false;
  if (NUMERIC_ONLY_BRACKET.test(match)) return true;

  const core = citationCoreFromInner(match.slice(1, -1));
  if (!core) return false;
  if (PAGE_CITE_SUFFIX.test(core)) return true;
  if (isAttachmentLabelCite(core)) return true;
  if (isAppendixCite(core)) return true;
  if (isDocumentNumberCite(core)) return true;
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
