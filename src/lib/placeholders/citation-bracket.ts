import { hasSupportedAttachmentExtension } from "@/lib/attachments/file-types";
import { citationDisplayFilename } from "@/lib/citations/citation-filename";

/** Citation-style `[12]` or combined `[1,2,3]` — not a fill-in placeholder. */
export const NUMERIC_ONLY_BRACKET = /^\[\s*\d+(?:\s*,\s*\d+)*\s*\]$/;

/** True when `[...]` is a numeric citation marker such as `[3]` or `[1,2]`. */
export function isNumericCitationMarker(match: string): boolean {
  return NUMERIC_ONLY_BRACKET.test(match);
}

/** Numbers inside `[3]` / `[1, 2, 3]`, in written order. */
export function citationNumbersFromMarker(match: string): number[] {
  if (!isNumericCitationMarker(match)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  const inner = match.slice(1, -1);
  for (const part of inner.split(",")) {
    const n = Number(part.trim());
    if (!Number.isInteger(n) || n < 1 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** First number inside `[3]` / `[1,2]`, or null when not a numeric marker. */
export function citationNumberFromMarker(match: string): number | null {
  return citationNumbersFromMarker(match)[0] ?? null;
}

/** `[1]` or combined `[1,2,3]` (no spaces). Empty when nothing to emit. */
export function formatNumericCitationMarker(
  numbers: readonly number[]
): string {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const n of numbers) {
    if (!Number.isInteger(n) || n < 1 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  if (out.length === 0) return "";
  return `[${out.join(",")}]`;
}

/** Click targets for each number inside a numeric marker. */
export type NumericCitationLinkSpan = {
  from: number;
  to: number;
  number: number;
};

export function numericCitationLinkSpans(
  match: string
): NumericCitationLinkSpan[] {
  if (!isNumericCitationMarker(match)) return [];
  const spans: NumericCitationLinkSpan[] = [];
  const inner = match.slice(1, -1);
  const re = /\d+/g;
  let found: RegExpExecArray | null;
  while ((found = re.exec(inner)) !== null) {
    const number = Number(found[0]);
    if (!Number.isInteger(number) || number < 1) continue;
    spans.push({
      from: 1 + found.index,
      to: 1 + found.index + found[0].length,
      number,
    });
  }
  return spans;
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

/**
 * One page or an inclusive range (`4`, `1-3`, `1–3`). Digits on both ends
 * are recorded; the first is the jump target. Do not expand the range.
 */
const PAGE_NUMBER = String.raw`\d+(?:\s*[-–]\s*\d+)?`;

/**
 * Page list after a filename: `, p. 4, 26`, `, p. 1-3`, or repeated `p.`
 * (`, p. 1, p. 2`). Extra pages may omit `p.` (`p. 4, 26, 163`) or repeat it.
 */
const PAGE_LIST_BODY = String.raw`,\s*p\.\s*${PAGE_NUMBER}(?:\s*,\s*(?:p\.\s*)?${PAGE_NUMBER})*`;
const PAGE_CITE_SUFFIX = new RegExp(`${PAGE_LIST_BODY}\\s*$`, "i");

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
 * Comma or semicolon that starts another source inside one `[...]`, not extra
 * pages of the same file (`p. 4, 26` / `p. 1, p. 2` / `p. 1-3`) and not a
 * comma glued to the extension (`,.pdf`). Used for extension-less exhibits
 * (Attachment / Appendix / CUID / QMS ids). Filenames with `.pdf`/`.docx`
 * split on the extension instead, so commas in the title stay in the filename.
 */
const NEW_SOURCE_COMMA_RE =
  /[;,]\s+(?=(?:(?!p\.\s*\d)[^[\]])*?\.(?:pdf|docx)\b|Attachment[_\s-]?(?:[IVXLCDM]+|\d+)\b|Appendix\s+(?:[A-Z](?:\.\d+)*|[IVXLCDM]{2,}|\d+)\b|[a-z0-9]{24}\b|\d{3,}-\d{4,})/i;

const PAGE_GROUP_RE = new RegExp(PAGE_LIST_BODY, "i");
const FILE_EXT_RE = /\.(?:pdf|docx)\b/gi;
/** Comma or semicolon between sources — not another `p. N` of this file. */
const SOURCE_SEPARATOR_RE = /^\s*[;,]\s+(?!p\.\s*\d)/;
const LEFTOVER_SOURCE_SEP_RE = /^\s*[;,]\s*/;

/**
 * Hyphenated / slashed exhibit ids (`E-PR-068`, `SOP/DP/QA/014`) that sit
 * beside a `.pdf`/`.docx` in an `and`-combined cite. Not a batch code
 * (`B-2024-117`) — those stay placeholders unless they already pass
 * `isCitationShapedCore`.
 */
const SOURCE_STEM_RE =
  /^(?:[A-Z]{1,8}(?:[-_/][A-Z0-9]{2,})+|[A-Z]{1,8}(?:\/[A-Z0-9]+)+)$/i;

function looksLikeSourceStem(text: string): boolean {
  const trimmed = citeCoreWithoutPage(text.trim());
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (isCitationShapedCore(trimmed)) return true;
  // Hyphenated English titles (`QDF-Filling`) match SOURCE_STEM_RE; a real
  // exhibit id also carries a digit (`E-PR-068`, `SOP/DP/QA/014`).
  return SOURCE_STEM_RE.test(trimmed) && /\d/.test(trimmed);
}

const AND_SOURCE_SEP_RE = /^\s*and\s+/i;

/**
 * Consume `,` / `;` / `and` between two `.pdf`/`.docx` anchors. Called only
 * when a later extension already exists, so `and` is structural here — not a
 * guess about exhibit ids.
 */
function skipSourceSeparator(inner: string, cursor: number): number {
  let i = cursor;
  while (i < inner.length && /\s/.test(inner[i]!)) i += 1;
  if (inner[i] === "," || inner[i] === ";") {
    i += 1;
    while (i < inner.length && /\s/.test(inner[i]!)) i += 1;
    return i;
  }
  const rest = inner.slice(cursor);
  const andSep = AND_SOURCE_SEP_RE.exec(rest);
  if (!andSep) return cursor;
  return cursor + andSep[0].length;
}

function citationBasename(filename: string): string {
  return filename.replace(/^.*[/\\]/, "").trim().toLowerCase();
}

function knownFilenameKeys(knownFilenames: readonly string[]): Set<string> {
  const keys = new Set<string>();
  for (const name of knownFilenames) {
    const key = citationBasename(citationDisplayFilename(name));
    if (key) keys.add(key);
  }
  return keys;
}

function citedFilenameKeys(cited: string): string[] {
  const base = citationBasename(citationDisplayFilename(cited));
  if (!base) return [];
  if (/\.(?:pdf|docx)$/i.test(base)) return [base];
  return [base, `${base}.pdf`, `${base}.docx`];
}

function citedMatchesKnownFile(cited: string, known: Set<string>): boolean {
  if (known.size === 0) return false;
  return citedFilenameKeys(cited).some((key) => known.has(key));
}

/**
 * True when `cited` is exactly a known attached/retrieved basename.
 * Includes-based fuzzy match is intentionally not used here — a stem like
 * `E-PR-068` would otherwise match `E-PR-068 and E-PR-071.pdf`.
 */
export function isExactKnownCitationFilename(
  cited: string,
  knownFilenames: readonly string[]
): boolean {
  const citedNorm = citationBasename(cited);
  if (!citedNorm) return false;
  return knownFilenames.some((name) => citationBasename(name) === citedNorm);
}

/**
 * Peel `E-PR-068 and E-PR-071.pdf` only when both sides **exactly** match
 * attached filenames (`E-PR-068.pdf` + `E-PR-071.pdf`). A slightly wrong
 * LLM name (`E-PR-71`) does not peel — fuzzy `filenameMatches` is for
 * click-to-open, not for deciding how many files exist. No attachment
 * list, or a title like `QDF-Filling and capping machine.pdf`, stays one
 * file. Two `.pdf`/`.docx` extensions still split via `skipSourceSeparator`.
 */
function peelAndSourcePrefix(
  inner: string,
  cursor: number,
  extIndex: number,
  known: Set<string>
): { prefix: string | null; start: number } {
  if (known.size === 0) return { prefix: null, start: cursor };
  const between = inner.slice(cursor, extIndex);
  const re = /\s+and\s+/gi;
  let last: { index: number; length: number } | null = null;
  let found: RegExpExecArray | null;
  while ((found = re.exec(between)) !== null) {
    last = { index: found.index, length: found[0].length };
  }
  if (!last) return { prefix: null, start: cursor };
  const left = between.slice(0, last.index).trim();
  const right = between.slice(last.index + last.length).trim();
  const ext = inner.slice(extIndex).match(/^\.(?:pdf|docx)\b/i)?.[0] ?? "";
  const rightFile = `${right}${ext}`;
  if (!citedMatchesKnownFile(left, known) || !citedMatchesKnownFile(rightFile, known)) {
    return { prefix: null, start: cursor };
  }
  return { prefix: left, start: cursor + last.index + last.length };
}

/**
 * Split on each `.pdf` / `.docx` so commas before the extension stay in the
 * filename. Page lists after the extension (including repeated `p.`) stay
 * with that file. Two extensions still yield two parts.
 */
function splitByPdfDocxAnchors(
  inner: string,
  known: Set<string>
): string[] | null {
  const extRe = new RegExp(FILE_EXT_RE.source, "gi");
  const matches: { index: number; length: number }[] = [];
  let found: RegExpExecArray | null;
  while ((found = extRe.exec(inner)) !== null) {
    matches.push({ index: found.index, length: found[0].length });
  }
  if (matches.length === 0) return null;

  const ranges: { start: number; end: number }[] = [];
  const prefixes: string[] = [];
  let cursor = 0;
  for (let i = 0; i < matches.length; i++) {
    const ext = matches[i]!;
    while (cursor < inner.length && /\s/.test(inner[cursor]!)) cursor += 1;
    if (i > 0) {
      const skipped = skipSourceSeparator(inner, cursor);
      if (skipped !== cursor) cursor = skipped;
    }
    const peeled = peelAndSourcePrefix(inner, cursor, ext.index, known);
    if (peeled.prefix) {
      prefixes.push(peeled.prefix);
      cursor = peeled.start;
    }
    if (ext.index < cursor) return null;
    let end = ext.index + ext.length;
    const after = inner.slice(end);
    const pageMatch = PAGE_GROUP_RE.exec(after);
    if (pageMatch && pageMatch.index === 0) {
      end += pageMatch[0].length;
    }
    ranges.push({ start: cursor, end });
    cursor = end;
  }

  const asParts = (extra: string[] = []): string[] =>
    [...prefixes, ...ranges.map((range) => inner.slice(range.start, range.end).trim()), ...extra]
      .map((part) => part.trim())
      .filter(Boolean);

  const leftover = inner.slice(cursor);
  const leftoverSep = LEFTOVER_SOURCE_SEP_RE.exec(leftover);
  if (leftoverSep) {
    const rest = leftover.slice(leftoverSep[0].length).trim();
    const parts = asParts(rest ? splitWithoutFileExtensions(rest) : []);
    return parts.length > 0 ? parts : null;
  }
  if (leftover.trim() && ranges.length > 0) {
    const leftoverAnd = AND_SOURCE_SEP_RE.exec(leftover);
    if (leftoverAnd) {
      const rest = leftover.slice(leftoverAnd[0].length).trim();
      // After a complete `.pdf`/`.docx`, `and` starts another source only
      // when that remainder is already a cite (Appendix / exhibit / file)
      // or an attached name — not English leftover (`and capping machine`).
      if (
        rest &&
        (isCitationShapedCore(rest) || citedMatchesKnownFile(rest, known))
      ) {
        const parts = asParts(splitWithoutFileExtensions(rest));
        return parts.length > 0 ? parts : null;
      }
    }
    ranges[ranges.length - 1]!.end = inner.length;
  }
  const parts = asParts();
  return parts.length > 0 ? parts : null;
}

/**
 * Split `[file A, p. N, file B, p. M]` (or `;` / `and` between files) into one inner
 * string per source. Same-file page lists (`p. 4, 26, 163`, `p. 1, p. 2`,
 * `p. 1-3`) stay a single part. Commas inside a `.pdf`/`.docx` filename are
 * not treated as a new source. Compact `E-PR-068 and E-PR-071.pdf` splits
 * only when those names are attached/retrieved as two files; English `and`
 * titles and an exact combined basename stay one filename.
 */
export function splitSourceCitationParts(
  inner: string,
  knownFilenames?: readonly string[]
): string[] {
  const trimmed = inner.trim();
  if (!trimmed) return [];
  if (
    knownFilenames &&
    isExactKnownCitationFilename(citeCoreWithoutPage(trimmed), knownFilenames)
  ) {
    return [trimmed];
  }
  const byExt = splitByPdfDocxAnchors(
    trimmed,
    knownFilenameKeys(knownFilenames ?? [])
  );
  if (byExt) return byExt;
  return splitWithoutFileExtensions(trimmed);
}

function splitWithoutFileExtensions(trimmed: string): string[] {
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
  match: string,
  knownFilenames?: readonly string[],
  knownAttachmentIds?: readonly string[]
): SourceCitationLinkSpan[] {
  if (!isSourceCitationBracket(match) || isNumericCitationMarker(match)) {
    return [];
  }
  // A bare CUID2 is accepted as a cite because the model copies attachment ids
  // out of the document index — but an analysis id is the same 24 chars in a
  // different namespace, and one reached a report's Citations list rendered as
  // a live link. When the caller knows this report's attachment ids, an
  // id-shaped token that is not one of them is not a source. Callers without
  // that list keep the old shape-only behaviour.
  if (
    knownAttachmentIds &&
    isAttachmentIdCite(citationCoreFromInner(match.slice(1, -1)) || "") &&
    !attachmentIdCiteIsKnown(match, knownAttachmentIds)
  ) {
    return [];
  }
  const inner = match.slice(1, -1);
  const core = citationCoreFromInner(inner);
  const parts = splitSourceCitationParts(core || inner, knownFilenames);
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
export function parseSourceCitation(
  match: string,
  knownFilenames?: readonly string[]
): ParsedSourceCitation | null {
  if (!isSourceCitationBracket(match)) return null;
  const core = citationCoreFromInner(match.slice(1, -1));
  if (!core) return null;
  const part = splitSourceCitationParts(core, knownFilenames)[0] ?? core;
  if (!part) return null;
  const filename = citeCoreWithoutPage(part);
  if (!filename) return null;
  return { filename, pages: pageNumbersFromCore(part) };
}

/**
 * Filename and pages from a source bracket without peeling `and` stems.
 * Use this before split when matching against a known attached file.
 */
export function parseSourceCitationUnsplit(
  match: string
): ParsedSourceCitation | null {
  if (!isSourceCitationBracket(match)) return null;
  const core = citationCoreFromInner(match.slice(1, -1));
  if (!core) return null;
  const filename = citeCoreWithoutPage(core);
  if (!filename) return null;
  return { filename, pages: pageNumbersFromCore(core) };
}

function canonicalizeSourceCitationPart(part: string): string {
  const filename = citeCoreWithoutPage(part);
  const display = citationDisplayFilename(filename);
  if (!filename || display === filename) return part.trim();
  return part.trim().replace(filename, display);
}

/**
 * Drop a trailing `_YYYYMMDDHHmmss` download stamp from each filename in a
 * source bracket so parked cites show the document number, not the export name.
 */
export function canonicalizeSourceCitationBracket(
  match: string,
  knownFilenames?: readonly string[]
): string {
  if (!isSourceCitationBracket(match) || isNumericCitationMarker(match)) {
    return match;
  }
  const inner = match.slice(1, -1);
  const core = citationCoreFromInner(inner);
  const parts = splitSourceCitationParts(core || inner, knownFilenames);
  if (parts.length === 0) return match;
  const next = parts.map((part) => canonicalizeSourceCitationPart(part));
  if (next.every((part, i) => part === parts[i]!.trim())) return match;
  return `[${next.join(", ")}]`;
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

/** True when every id-shaped token in the cite is an attachment on this report. */
function attachmentIdCiteIsKnown(
  match: string,
  knownAttachmentIds: readonly string[]
): boolean {
  const known = new Set(knownAttachmentIds.map((id) => id.toLowerCase()));
  const core = citeCoreWithoutPage(
    citationCoreFromInner(match.slice(1, -1)) || ""
  );
  const parts = core
    .split(/\s*,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => known.has(part.toLowerCase()));
}

function isCitationShapedCore(core: string): boolean {
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
 * True when `[...]` is a document citation, not a Placeholders-panel token.
 *
 * Recognizes:
 * - numeric `[12]`
 * - page cites `[name, p. N]` / `[name, p. N, M]` / `[name, p. 1, p. 2]` /
 *   `[name, p. 1-3]` (any name; extension optional; commas in the filename stay
 *   in that cite)
 * - combined sources in one bracket, comma, semicolon, or `and` separated
 *   (`[A.pdf, p. 1; B.pdf, p. 1-3]`, `[E-PR-068.pdf and E-PR-071.pdf, p. 1]`)
 *   when every part is a cite or a hyphenated/slashed exhibit stem. Compact
 *   `E-PR-068 and E-PR-071.pdf` (one extension) splits only when those files
 *   are in `knownFilenames`.
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
  const parts = splitSourceCitationParts(core);
  if (parts.length > 1) {
    const shaped = parts.filter((part) => isCitationShapedCore(part));
    if (shaped.length === 0) return false;
    return parts.every(
      (part) =>
        isCitationShapedCore(part) ||
        looksLikeSourceStem(citeCoreWithoutPage(part))
    );
  }
  return isCitationShapedCore(core);
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
