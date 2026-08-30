import type { JSONContent } from "@tiptap/core";
import { isSourceCitationBracket } from "@/lib/placeholders/citation-bracket";
import type { EditScope } from "@/lib/suggestions/locator";
import type { TableOperation } from "@/lib/suggestions/table-operation";

export type SuggestionEditPart = {
  anchorText: string;
  deleteText: string;
  insertText: string;
  scope?: EditScope;
};

export type SplitSuggestionEdit = SuggestionEditPart & {
  second?: SuggestionEditPart;
};

const BRACKET_RE = /\[[^\]]+\]/g;
const NUMBERED_LIST_PREFIX = /^(\d+)\.\s+/;
const ADJACENT_MARKER_GAP = /(\[\d+\])[ \t]+(?=\[\d+\])/g;

/** Heading written once above the parked citation list. */
export const CITATIONS_HEADING = "Citations:";

export function isCitationsHeading(line: string): boolean {
  return /^#{0,6}\s*citations\s*:?\s*$/i.test(line.trim());
}

export function documentCitationRule(citationsAtEndOfSection: boolean): string {
  if (citationsAtEndOfSection) {
    return 'Cite evidence as [filename, p. N] when the page is known, or [filename] when it is not. Place those source brackets immediately after the supported statement (or table cell). The application converts them to numbered markers and parks the sources at the end of the section field under a "Citations:" heading. For a body change plus a citation you may still use a split edit (primary + second); inline source brackets in the primary are numbered automatically. Never use <to be filled> in a citation.';
  }
  return "Cite evidence in prose as [filename, p. N] when the page is known, or [filename] when it is not. Never use <to be filled> in a citation.";
}

function uniquePreserveOrder(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function findSourceCitationSpans(
  text: string
): Array<{ start: number; end: number; text: string }> {
  const spans: Array<{ start: number; end: number; text: string }> = [];
  BRACKET_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BRACKET_RE.exec(text)) !== null) {
    if (!isSourceCitationBracket(match[0])) continue;
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
  }
  return spans;
}

/** Source citation brackets in `text`, in document order, de-duplicated. */
export function extractCitationBrackets(text: string): string[] {
  return uniquePreserveOrder(
    findSourceCitationSpans(text).map((span) => span.text)
  );
}

export function citationMarker(n: number): string {
  return `[${n}]`;
}

function numberedCitationLine(n: number, source: string): string {
  return `${n}. ${source}`;
}

class FieldCitationNumbering {
  private readonly sourceToNumber = new Map<string, number>();
  private readonly used = new Set<number>();

  seed(source: string, number?: number): void {
    if (this.sourceToNumber.has(source)) return;
    const n =
      number != null && Number.isFinite(number) && number > 0 && !this.used.has(number)
        ? number
        : this.nextUnused();
    this.sourceToNumber.set(source, n);
    this.used.add(n);
  }

  assign(source: string): { number: number; isNew: boolean } {
    const existing = this.sourceToNumber.get(source);
    if (existing != null) return { number: existing, isNew: false };
    const n = this.nextUnused();
    this.sourceToNumber.set(source, n);
    this.used.add(n);
    return { number: n, isNew: true };
  }

  private nextUnused(): number {
    let n = 1;
    while (this.used.has(n)) n += 1;
    return n;
  }

  entries(): Array<{ number: number; source: string }> {
    return [...this.sourceToNumber.entries()]
      .map(([source, number]) => ({ number, source }))
      .sort((a, b) => a.number - b.number);
  }

  numbers(): Set<number> {
    return new Set(this.used);
  }
}

function parseCitationListLine(
  line: string
): { number: number | null; sources: string[] } | null {
  const trimmed = line.trim();
  if (!trimmed || isCitationBlockHeading(trimmed)) return null;
  const numbered = NUMBERED_LIST_PREFIX.exec(trimmed);
  const rest = numbered ? trimmed.slice(numbered[0].length) : trimmed;
  const sources = extractCitationBrackets(rest);
  if (sources.length === 0) return null;
  const leftover = stripCitationsFromText(rest).prose.trim();
  if (leftover) return null;
  return {
    number: numbered ? Number(numbered[1]) : null,
    sources,
  };
}

function numberingFromTrailingLines(lines: readonly string[]): FieldCitationNumbering {
  const numbering = new FieldCitationNumbering();
  const parsed = lines
    .map((line) => parseCitationListLine(line))
    .filter((line): line is { number: number | null; sources: string[] } => line != null);
  for (const line of parsed) {
    if (line.number != null && line.sources[0]) {
      numbering.seed(line.sources[0], line.number);
    }
  }
  for (const line of parsed) {
    for (const source of line.sources) numbering.seed(source);
  }
  return numbering;
}

function parseFieldCitationNumbering(existingFieldText: string): FieldCitationNumbering {
  return numberingFromTrailingLines(splitTrailingCitationBlock(existingFieldText).lines);
}

function replaceSourceCitationsWithMarkers(
  text: string,
  numbering: FieldCitationNumbering
): {
  text: string;
  assigned: Array<{ source: string; number: number; isNew: boolean }>;
} {
  const spans = findSourceCitationSpans(text);
  if (spans.length === 0) return { text, assigned: [] };

  const assigned: Array<{ source: string; number: number; isNew: boolean }> = [];
  const replacements: Array<{ start: number; end: number; marker: string }> = [];
  for (const span of spans) {
    const result = numbering.assign(span.text);
    assigned.push({ source: span.text, number: result.number, isNew: result.isNew });
    replacements.push({
      start: span.start,
      end: span.end,
      marker: citationMarker(result.number),
    });
  }

  let next = text;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const replacement = replacements[i]!;
    next =
      next.slice(0, replacement.start) +
      replacement.marker +
      next.slice(replacement.end);
  }
  return { text: collapseAdjacentCitationMarkers(next), assigned };
}

function collapseAdjacentCitationMarkers(text: string): string {
  return text.replace(ADJACENT_MARKER_GAP, "$1");
}

function appendCitationMarkers(prose: string, numbers: readonly number[]): string {
  const markers = uniquePreserveOrder(numbers.map((n) => citationMarker(n))).join("");
  if (!markers) return prose;
  if (!prose) return markers;
  if (/\s$/.test(prose) || /\[\d+\]$/.test(prose.trimEnd())) {
    return collapseAdjacentCitationMarkers(`${prose.trimEnd()}${markers}`);
  }
  return collapseAdjacentCitationMarkers(`${prose} ${markers}`);
}

export function isCitationOnlyText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const withoutNumber = trimmed.replace(NUMBERED_LIST_PREFIX, "");
  const { prose, citations } = stripCitationsFromText(withoutNumber);
  return citations.length > 0 && prose.trim() === "";
}

/**
 * Remove document source citations from `text` and return the leftover prose.
 * Numeric markers such as `[1]` stay in place. Preserves a single leading
 * space when the original insert was mid-sentence.
 */
export function stripCitationsFromText(text: string): {
  prose: string;
  citations: string[];
} {
  const spans = findSourceCitationSpans(text);
  if (spans.length === 0) return { prose: text, citations: [] };

  let prose = text;
  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i]!;
    prose = prose.slice(0, span.start) + prose.slice(span.end);
  }
  prose = tidyAfterCitationRemoval(prose);
  const hadLeadingSpace = /^\s/.test(text);
  prose = prose.replace(/[ \t]+$/g, "");
  prose = prose.replace(/^[ \t]+/, hadLeadingSpace && prose.trim() ? " " : "");
  if (/^[.,;:!?]*$/.test(prose.trim())) {
    prose = "";
  }
  return {
    prose,
    citations: uniquePreserveOrder(spans.map((span) => span.text)),
  };
}

function tidyAfterCitationRemoval(text: string): string {
  return text
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ");
}

function isCitationOnlyLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return isCitationOnlyText(trimmed);
}

function isReferencesHeading(line: string): boolean {
  return /^#{0,6}\s*references\s*:?\s*$/i.test(line.trim());
}

function isCitationBlockHeading(line: string): boolean {
  return isCitationsHeading(line) || isReferencesHeading(line);
}

export function isCitationListHeading(line: string): boolean {
  return isCitationBlockHeading(line);
}

function paragraphPlainText(block: {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
}): string {
  return (block.content ?? [])
    .map((node) => (node.type === "text" ? node.text ?? "" : ""))
    .join("");
}

export function isCitationHeadingParagraph(block: {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
}): boolean {
  return (
    (block.type === "paragraph" || block.type === "heading") &&
    isCitationListHeading(paragraphPlainText(block))
  );
}

function nodePlainText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map((child) => nodePlainText(child)).join("");
}

function isCitationOnlyBlock(block: JSONContent): boolean {
  if (block.type === "table") return false;
  if (block.type === "paragraph" || block.type === "heading") {
    return isCitationOnlyText(paragraphPlainText(block));
  }
  if (block.type === "bulletList" || block.type === "orderedList") {
    return isCitationOnlyText(nodePlainText(block));
  }
  return false;
}

export function isEmptyParagraphBlock(block: {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
}): boolean {
  if (block.type !== "paragraph") return false;
  const hasNonText = (block.content ?? []).some(
    (node) => node.type !== "text" && node.type !== "hardBreak"
  );
  return !hasNonText && paragraphPlainText(block).length === 0;
}

/** Keep a spacer paragraph so Citations: is not flush against the body. */
export function keepEmptyParagraphBeforeCitationHeading(
  block: { type?: string; content?: Array<{ type?: string; text?: string }> },
  following:
    | { type?: string; content?: Array<{ type?: string; text?: string }> }
    | undefined
): boolean {
  return (
    isEmptyParagraphBlock(block) &&
    following !== undefined &&
    isCitationHeadingParagraph(following)
  );
}

function paragraphWithText(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function mapJsonTextNodes(
  node: JSONContent,
  rewrite: (text: string) => string
): JSONContent {
  if (node.type === "text" && typeof node.text === "string") {
    return { ...node, text: rewrite(node.text) };
  }
  if (node.content?.length) {
    return {
      ...node,
      content: node.content.map((child) => mapJsonTextNodes(child, rewrite)),
    };
  }
  return node;
}

function stripNumericMarkersFromText(
  text: string,
  numbers: ReadonlySet<number>
): string {
  if (numbers.size === 0) return text;
  const next = text.replace(/\[\s*(\d+)\s*\]/g, (full, raw: string) =>
    numbers.has(Number(raw)) ? "" : full
  );
  return tidyAfterCitationRemoval(next).replace(/[ \t]+$/g, "");
}

type TrailingCitationSplit = {
  body: string;
  trailingCitations: string[];
  heading: string;
  lines: string[];
};

function splitTrailingCitationBlock(text: string): TrailingCitationSplit {
  const lines = text.split("\n");
  const citations: string[] = [];
  const trailingLines: string[] = [];
  let i = lines.length - 1;
  while (i >= 0 && lines[i]!.trim() === "") i--;
  while (i >= 0 && isCitationOnlyLine(lines[i]!)) {
    const line = lines[i]!;
    trailingLines.unshift(line);
    citations.unshift(...extractCitationBrackets(line));
    i--;
  }
  let heading = "";
  if (i >= 0 && isCitationBlockHeading(lines[i]!)) {
    heading = lines[i]!.trim();
    i--;
  }
  while (i >= 0 && lines[i]!.trim() === "") i--;
  return {
    body: lines.slice(0, i + 1).join("\n"),
    trailingCitations: uniquePreserveOrder(citations),
    heading,
    lines: trailingLines,
  };
}

type TrailingDocRange = {
  cut: number;
  headingStart: number;
  end: number;
};

/**
 * Index at which new body content (prose, tables, figures) should land.
 * Trailing Citations:/References: stay after this index. Replaces a dangling
 * empty paragraph when the field has no citation block.
 */
export function fieldBodyInsertIndex(doc: JSONContent): number {
  const blocks = doc.content;
  if (!Array.isArray(blocks) || blocks.length === 0) return 0;
  const range = findTrailingCitationRange(blocks);
  if (range) return range.cut;
  const last = blocks[blocks.length - 1];
  if (last && isEmptyParagraphBlock(last)) return blocks.length - 1;
  return blocks.length;
}

export function hasTrailingCitationBlock(doc: JSONContent): boolean {
  return Array.isArray(doc.content) && findTrailingCitationRange(doc.content) !== null;
}

function findTrailingCitationRange(
  blocks: JSONContent[]
): TrailingDocRange | null {
  let end = blocks.length;
  while (end > 0 && isEmptyParagraphBlock(blocks[end - 1]!)) {
    end -= 1;
  }
  let citeStart = end;
  while (citeStart > 0 && isCitationOnlyBlock(blocks[citeStart - 1]!)) {
    citeStart -= 1;
  }
  let headingStart = citeStart;
  if (citeStart > 0 && isCitationHeadingParagraph(blocks[citeStart - 1]!)) {
    headingStart = citeStart - 1;
  }
  if (headingStart === end) return null;

  let cut = headingStart;
  while (cut > 0 && isEmptyParagraphBlock(blocks[cut - 1]!)) {
    cut -= 1;
  }
  return { cut, headingStart, end };
}

function trailingLinesFromDoc(blocks: JSONContent[], range: TrailingDocRange): string[] {
  const lines: string[] = [];
  for (let i = range.headingStart; i < range.end; i++) {
    const block = blocks[i]!;
    if (isCitationHeadingParagraph(block) || isEmptyParagraphBlock(block)) continue;
    if (block.type === "paragraph" || block.type === "heading") {
      lines.push(paragraphPlainText(block));
    } else {
      lines.push(nodePlainText(block));
    }
  }
  return lines;
}

function numberingFromDoc(doc: JSONContent): FieldCitationNumbering {
  if (doc.type !== "doc" || !Array.isArray(doc.content) || doc.content.length === 0) {
    return new FieldCitationNumbering();
  }
  const range = findTrailingCitationRange(doc.content);
  if (!range) return new FieldCitationNumbering();
  return numberingFromTrailingLines(trailingLinesFromDoc(doc.content, range));
}

/** Numbers assigned in the field's trailing Citations list. */
export function citationNumbersFromText(text: string): Set<number> {
  return parseFieldCitationNumbering(text).numbers();
}

/** Numbers assigned in a TipTap field's trailing Citations list. */
export function citationNumbersFromDoc(doc: JSONContent): Set<number> {
  return numberingFromDoc(doc).numbers();
}

/** Drop a trailing Citations:/References: block from plain text. */
export function stripTrailingCitationBlockFromText(text: string): string {
  const split = splitTrailingCitationBlock(text);
  const numbers = numberingFromTrailingLines(split.lines).numbers();
  return stripNumericMarkersFromText(split.body, numbers);
}

/**
 * Drop a trailing citation list from a TipTap doc (heading + cite lines +
 * the spacer before it), then strip matching `[n]` markers from the remaining
 * body and table cells.
 */
export function stripTrailingCitationBlockFromDoc(doc: JSONContent): JSONContent {
  if (doc.type !== "doc" || !Array.isArray(doc.content) || doc.content.length === 0) {
    return doc;
  }
  const blocks = doc.content;
  const range = findTrailingCitationRange(blocks);
  if (!range) return doc;

  const numbers = numberingFromTrailingLines(
    trailingLinesFromDoc(blocks, range)
  ).numbers();
  const next = blocks.slice(0, range.cut);
  const stripped: JSONContent = {
    ...doc,
    content: next.length > 0 ? next : [{ type: "paragraph" }],
  };
  if (numbers.size === 0) return stripped;
  return mapJsonTextNodes(stripped, (text) =>
    stripNumericMarkersFromText(text, numbers)
  );
}

function isTiptapDoc(value: unknown): value is JSONContent {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as JSONContent).type === "doc"
  );
}

/**
 * Walk section JSON and strip trailing citation blocks from each TipTap doc
 * or plain-text field, including `[n]` markers inside table cells.
 */
export function stripTrailingCitationsFromContent(content: unknown): unknown {
  if (typeof content === "string") {
    return stripTrailingCitationBlockFromText(content);
  }
  if (isTiptapDoc(content)) {
    return stripTrailingCitationBlockFromDoc(content);
  }
  if (Array.isArray(content)) {
    return content.map((item) => stripTrailingCitationsFromContent(item));
  }
  if (content && typeof content === "object") {
    return Object.fromEntries(
      Object.entries(content as Record<string, unknown>).map(([key, value]) => [
        key,
        stripTrailingCitationsFromContent(value),
      ])
    );
  }
  return content;
}

/** True when the field already ends with a Citations/References block. */
export function trailingIsCitationBlock(text: string): boolean {
  const { trailingCitations, heading } = splitTrailingCitationBlock(text);
  return trailingCitations.length > 0 || heading.length > 0;
}

/**
 * Insert text for newly parked citations. Adds a `Citations:` heading the
 * first time; later cites append as extra numbered lines under the existing block.
 */
export function citationInsertText(
  citations: readonly string[],
  existingFieldText = ""
): string {
  const unique = uniquePreserveOrder(citations);
  if (unique.length === 0) return "";
  const numbering = parseFieldCitationNumbering(existingFieldText);
  const lines = unique.map((source) => {
    const { number } = numbering.assign(source);
    return numberedCitationLine(number, source);
  });
  if (trailingIsCitationBlock(existingFieldText)) {
    return lines.join("\n");
  }
  return `${CITATIONS_HEADING}\n${lines.join("\n")}`;
}

/** Insert that is only a heading plus citation brackets (or just brackets). */
export function isCitationAppendInsert(text: string): boolean {
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return false;
  const start = isCitationBlockHeading(lines[0]!) ? 1 : 0;
  const rest = lines.slice(start);
  if (rest.length === 0) return start === 1;
  return rest.every((line) => isCitationOnlyLine(line));
}

/** Upgrade a bare cite list to include `Citations:` when the field has none. */
export function normalizeCitationAppendInsert(
  existing: string,
  insert: string
): string {
  if (!isCitationAppendInsert(insert)) return insert;
  const lines = insert
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const cites = lines.flatMap((line) =>
    isCitationBlockHeading(line) ? [] : extractCitationBrackets(line)
  );
  if (cites.length === 0) return insert;
  return citationInsertText(cites, existing);
}

/** Blank line before a new `Citations:` heading; single newline for extra cites. */
export function plainCitationAppendSeparator(
  existing: string,
  insertText: string
): string {
  if (!existing) return "";
  if (!isCitationAppendInsert(insertText)) {
    return /\s$/.test(existing) ? "" : " ";
  }
  const firstLine =
    insertText
      .split(/\n/)
      .find((line) => line.trim())
      ?.trim() ?? "";
  if (isCitationBlockHeading(firstLine) && !trailingIsCitationBlock(existing)) {
    return /\n$/.test(existing) ? "\n" : "\n\n";
  }
  return /\n$/.test(existing) ? "" : "\n";
}

export function joinBodyAndCitationInsert(
  body: string,
  citationInsert: string
): string {
  if (!citationInsert) return body;
  if (!body) return citationInsert;
  return `${body}${plainCitationAppendSeparator(body, citationInsert)}${citationInsert}`;
}

function rebuildCitationBlock(numbering: FieldCitationNumbering): string {
  const lines = numbering.entries().map(({ number, source }) =>
    numberedCitationLine(number, source)
  );
  if (lines.length === 0) return "";
  return `${CITATIONS_HEADING}\n${lines.join("\n")}`;
}

/** Rewrite a trailing citation list into numbered `n. [source]` lines. */
export function normalizeTrailingCitationBlockInText(text: string): string {
  const split = splitTrailingCitationBlock(text);
  if (split.trailingCitations.length === 0 && !split.heading) return text;
  const numbering = numberingFromTrailingLines(split.lines);
  const block = rebuildCitationBlock(numbering);
  if (!block) return split.body;
  const bodyOut = split.body.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trimEnd();
  return bodyOut ? `${bodyOut}\n\n${block}` : block;
}

/** Rewrite a TipTap field's trailing citation list into numbered lines. */
export function normalizeTrailingCitationBlockInDoc(doc: JSONContent): JSONContent {
  if (doc.type !== "doc" || !Array.isArray(doc.content) || doc.content.length === 0) {
    return doc;
  }
  const range = findTrailingCitationRange(doc.content);
  if (!range) return doc;
  const numbering = numberingFromTrailingLines(
    trailingLinesFromDoc(doc.content, range)
  );
  const entries = numbering.entries();
  if (entries.length === 0) return doc;

  const prefix = doc.content.slice(0, range.cut);
  const last = prefix[prefix.length - 1];
  const withSpacer =
    last && !isEmptyParagraphBlock(last) ? [...prefix, { type: "paragraph" }] : prefix;
  return {
    ...doc,
    content: [
      ...withSpacer,
      paragraphWithText(CITATIONS_HEADING),
      ...entries.map(({ number, source }) =>
        paragraphWithText(numberedCitationLine(number, source))
      ),
    ],
  };
}

/**
 * Move inline document citations to a trailing block at the end of `text`.
 * Used for whole-field drafts when citations-at-end mode is on.
 */
export function moveCitationsToEndOfText(text: string): string {
  const { body, lines } = splitTrailingCitationBlock(text);
  const numbering = numberingFromTrailingLines(lines);
  const replaced = replaceSourceCitationsWithMarkers(body, numbering);
  const block = rebuildCitationBlock(numbering);
  if (!block && replaced.assigned.length === 0) return text;
  const bodyOut = replaced.text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trimEnd();
  if (!block) return bodyOut;
  return bodyOut ? `${bodyOut}\n\n${block}` : block;
}

function hasPartContent(part: Pick<SuggestionEditPart, "deleteText" | "insertText">): boolean {
  return Boolean(part.deleteText.trim() || part.insertText.trim());
}

/**
 * Split a single-site edit so new citations land at the end of the field
 * and the claim keeps a numbered `[n]` marker.
 */
export function splitEditForCitationsAtEnd(
  edit: SplitSuggestionEdit,
  opts?: { existingFieldText?: string }
): SplitSuggestionEdit {
  const existingFieldText = opts?.existingFieldText ?? "";
  const numbering = parseFieldCitationNumbering(existingFieldText);

  const fromPrimary = replaceSourceCitationsWithMarkers(edit.insertText, numbering);
  const fromSecondSources = edit.second
    ? extractCitationBrackets(edit.second.insertText)
    : [];

  const secondAssigned = fromSecondSources.map((source) => numbering.assign(source));
  const newSources = uniquePreserveOrder([
    ...fromPrimary.assigned.filter((item) => item.isNew).map((item) => item.source),
    ...fromSecondSources.filter((_, i) => secondAssigned[i]?.isNew),
  ]);

  let bodyInsert = fromPrimary.text;
  if (fromPrimary.assigned.length === 0 && secondAssigned.length > 0) {
    bodyInsert = appendCitationMarkers(
      bodyInsert,
      secondAssigned.map((item) => item.number)
    );
  }

  const primary: SuggestionEditPart = {
    anchorText: edit.anchorText,
    deleteText: edit.deleteText,
    insertText: bodyInsert,
    scope: edit.scope,
  };

  const citationPart: SuggestionEditPart | undefined =
    newSources.length > 0
      ? {
          anchorText: edit.second?.anchorText ?? "",
          deleteText: edit.second?.deleteText ?? "",
          insertText: citationInsertText(newSources, existingFieldText),
          scope: edit.second?.scope,
        }
      : undefined;

  if (!hasPartContent(primary)) {
    if (!citationPart) return primary;
    if (edit.anchorText || edit.deleteText) {
      return citationPart;
    }
    return citationPart;
  }

  if (!citationPart) return primary;
  return { ...primary, second: citationPart };
}

/**
 * Apply pack policy: drop `second` when the mode is off; split citations
 * to the end when it is on.
 */
export function prepareEditForCitationMode<T extends SplitSuggestionEdit>(
  edit: T,
  opts: { citationsAtEndOfSection: boolean; existingFieldText?: string }
): T {
  if (!opts.citationsAtEndOfSection) {
    if (!edit.second) return edit;
    const rest = { ...edit };
    delete rest.second;
    return rest;
  }
  return { ...edit, ...splitEditForCitationsAtEnd(edit, opts) };
}

/**
 * Replace source citation brackets in table-operation strings with numbered
 * markers so they can be appended at the end of the field as a split `second`
 * part.
 */
export function stripCitationsFromTableOperation(
  operation: TableOperation,
  existingFieldText = ""
): {
  operation: TableOperation;
  citations: string[];
} {
  const numbering = parseFieldCitationNumbering(existingFieldText);
  const citations: string[] = [];
  const take = (value: string): string => {
    const { text, assigned } = replaceSourceCitationsWithMarkers(value, numbering);
    for (const item of assigned) {
      if (item.isNew) citations.push(item.source);
    }
    return text;
  };

  switch (operation.kind) {
    case "edit_cells":
      return {
        operation: {
          ...operation,
          cells: operation.cells.map((cell) => ({
            ...cell,
            insertText: take(cell.insertText),
          })),
        },
        citations: uniquePreserveOrder(citations),
      };
    case "insert_rows":
      return {
        operation: {
          ...operation,
          rows: operation.rows.map((row) => row.map((cell) => take(cell))),
        },
        citations: uniquePreserveOrder(citations),
      };
    case "insert_column":
      return {
        operation: {
          ...operation,
          header: take(operation.header),
          values: operation.values?.map((value) => take(value)),
        },
        citations: uniquePreserveOrder(citations),
      };
    case "delete_rows":
    case "delete_column":
      return { operation, citations: [] };
    case "create_table":
      return {
        operation: {
          ...operation,
          headers: operation.headers.map((header) => take(header)),
          rows: operation.rows?.map((row) => row.map((cell) => take(cell))),
        },
        citations: uniquePreserveOrder(citations),
      };
    default: {
      const _exhaustive: never = operation;
      return _exhaustive;
    }
  }
}

export function citationAppendPart(
  citations: readonly string[],
  existingFieldText = ""
): SuggestionEditPart | undefined {
  const numbering = parseFieldCitationNumbering(existingFieldText);
  const fresh = uniquePreserveOrder(citations).filter(
    (source) => numbering.assign(source).isNew
  );
  if (fresh.length === 0) return undefined;
  return {
    anchorText: "",
    deleteText: "",
    insertText: citationInsertText(fresh, existingFieldText),
  };
}
