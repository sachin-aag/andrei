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

/** `[filename, p. N]` / `[filename, p. N, M]` page citation suffix. */
const PAGE_CITE_SUFFIX = /,\s*p\.\s*\d+(?:\s*,\s*\d+)*\s*$/i;

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
 * Pharma / QMS document numbers such as `790-00134R`, `790-00134R(RevU)`,
 * or glued/underscored stems (`790-00134RRevU…`, `790-00134R_Rev_U_…`).
 * Requires 3+ digits, hyphen, 4+ digits so ranges like `12-34` and dates
 * like `2024-01-15` are not treated as cites. No trailing `\b`: the optional
 * revision letter is often followed by `_` or more letters (`RRevU`), and
 * `_` is a word character so `\b` would miss those stems.
 */
const DOCUMENT_NUMBER = /\b\d{3,}-\d{4,}/;

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

/**
 * Comma that starts another source inside one `[...]`, not extra pages of
 * the same file (`p. 4, 26`) and not a comma glued to the extension (`,.pdf`).
 */
const NEW_SOURCE_COMMA_RE =
  /,\s+(?=(?:(?!p\.\s*\d)[^[\]])*?\.(?:pdf|docx)\b|Attachment[_\s-]?(?:[IVXLCDM]+|\d+)\b|Appendix\s+(?:[A-Z](?:\.\d+)*|[IVXLCDM]{2,}|\d+)\b|[a-z0-9]{24}\b|\d{3,}-\d{4,})/i;

const PAGE_GROUP_RE = /,\s*p\.\s*\d+(?:\s*,\s*\d+)*/i;
const SOURCE_SEPARATOR_RE = /^\s*,\s+/;

/**
 * Split `[file A, p. N, file B, p. M]` into one inner string per source.
 * Same-file page lists (`p. 4, 26, 163`) stay a single part.
 */
export function splitSourceCitationParts(inner: string): string[] {
  const trimmed = inner.trim();
  if (!trimmed) return [];
  const parts: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    const rest = trimmed.slice(start);
    const pageGroup = PAGE_GROUP_RE.exec(rest);
    if (pageGroup && pageGroup.index != null) {
      const afterPage = rest.slice(pageGroup.index + pageGroup[0].length);
      const sep = SOURCE_SEPARATOR_RE.exec(afterPage);
      if (sep) {
        const splitAt = start + pageGroup.index + pageGroup[0].length;
        const piece = trimmed.slice(start, splitAt).trim();
        if (piece) parts.push(piece);
        start = splitAt + sep[0].length;
        continue;
      }
    }
    const fileComma = NEW_SOURCE_COMMA_RE.exec(rest);
    if (fileComma && fileComma.index != null) {
      const piece = rest.slice(0, fileComma.index).trim();
      if (piece) parts.push(piece);
      start += fileComma.index + fileComma[0].length;
      continue;
    }
    const tail = rest.trim();
    if (tail) parts.push(tail);
    break;
  }
  return parts.length > 0 ? parts : [trimmed];
}

/** Clickable range inside a source `[...]` (offsets are in `match`). */
export type SourceCitationLinkSpan = {
  from: number;
  to: number;
  openRaw: string;
};

/**
 * Click targets for a source bracket. One file stays the whole `[...]`.
 * Combined cites (`[A.pdf, p. 1, B.pdf, p. 2]`) get one span per file so
 * each can open on its own.
 */
export function sourceCitationLinkSpans(
  match: string
): SourceCitationLinkSpan[] {
  if (!isSourceCitationBracket(match) || isNumericCitationMarker(match)) {
    return [];
  }
  const inner = match.slice(1, -1);
  const core = citationCoreFromInner(inner);
  const parts = splitSourceCitationParts(core || inner);
  if (parts.length <= 1) {
    return [
      {
        from: 0,
        to: match.length,
        openRaw: core ? `[${core}]` : match,
      },
    ];
  }

  const spans: SourceCitationLinkSpan[] = [];
  let searchFrom = 1;
  for (const part of parts) {
    const idx = match.indexOf(part, searchFrom);
    if (idx < 0) continue;
    spans.push({
      from: idx,
      to: idx + part.length,
      openRaw: `[${part}]`,
    });
    searchFrom = idx + part.length;
  }
  if (spans.length === 0) {
    return [
      {
        from: 0,
        to: match.length,
        openRaw: `[${parts[0]}]`,
      },
    ];
  }
  return spans;
}

/** Filename (or exhibit label) plus page numbers from a source citation. */
export type ParsedSourceCitation = {
  filename: string;
  pages: number[];
};

function pageNumbersFromCore(core: string): number[] {
  const suffix = PAGE_CITE_SUFFIX.exec(core);
  if (!suffix) return [];
  const digits = suffix[0].match(/\d+/g);
  if (!digits) return [];
  return digits
    .map((raw) => Number(raw))
    .filter((n) => Number.isInteger(n) && n >= 1);
}

/**
 * Parse `[filename, p. N]` / `[filename]` into a filename and page list.
 * The first page is the jump target when the cite lists several.
 */
export function parseSourceCitation(match: string): ParsedSourceCitation | null {
  if (!isSourceCitationBracket(match)) return null;
  const core = citationCoreFromInner(match.slice(1, -1));
  if (!core) return null;
  const part = splitSourceCitationParts(core)[0] ?? core;
  if (!part) return null;
  const filename = citeCoreWithoutPage(part);
  if (!filename) return null;
  return { filename, pages: pageNumbersFromCore(part) };
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
 * MJ / pharma QMS identifiers. Slash SOP paths (`SOP/DP/QA/008`,
 * `E/PR/070`, `ELR/DP/PR/26/001`) and hyphenated codes with a 2+ letter
 * prefix plus a later letter segment (`PRQR-25-PR-005`). Does not match
 * batch-style `B-2024-117` or two-part `DEV-001`.
 */
const QMS_DOCUMENT_ID =
  /\b(?:[A-Z]{1,8}(?:\/[A-Z]{1,8})+\/\d{2,}(?:\/[A-Z0-9]+)*|[A-Z]{2,8}(?:-[A-Z]{1,8})*-\d{2,}(?:-[A-Z]{1,8}-\d{2,})+)\b/i;

function isQmsDocumentIdCite(core: string): boolean {
  return QMS_DOCUMENT_ID.test(citeCoreWithoutPage(core));
}

/**
 * Default `@paralleldrive/cuid2` `createId()` token (attachment primary keys).
 * Chat tools list `id=` next to the filename; the model sometimes pastes that
 * id in brackets. Same class as underscored report-number cites: a source
 * cite, not a fill-in placeholder.
 */
const ATTACHMENT_ID_TOKEN = /^[a-z0-9]{24}$/;

function isAttachmentIdCite(core: string): boolean {
  const withoutPage = citeCoreWithoutPage(core);
  if (!withoutPage) return false;
  const parts = withoutPage
    .split(/\s*,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => ATTACHMENT_ID_TOKEN.test(part));
}

/**
 * True when `[...]` is a document citation, not a Placeholders-panel token.
 *
 * Recognizes:
 * - numeric `[12]`
 * - page cites `[name, p. N]` / `[name, p. N, M]` (any name; extension optional)
 * - bare attachment filenames using supported extensions from file-types
 * - extension-less exhibit labels (`[Attachment_XIV]`, lists, optional page)
 * - appendix / report-number cites (`[Appendix B]`,
 *   `[Appendix B DV Report 790-00134R(RevU)]`,
 *   `[790-00134R_Rev_U_Solea_Model_3_Software_…]`)
 * - MJ QMS identifiers (`[PRQR-25-PR-005]`, `[SOP/DP/QA/008]`, `[E/PR/070]`)
 * - CUID2 attachment ids (`[me1q4zzhb1me0wwskpmqfw7i]`, optional page)
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
  if (isQmsDocumentIdCite(core)) return true;
  if (isAttachmentIdCite(core)) return true;
  return hasSupportedAttachmentExtension(citeCoreWithoutPage(core));
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
