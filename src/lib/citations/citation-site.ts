export type TextSpan = { start: number; end: number };

/**
 * Sentence spans in `text`. Prefers `Intl.Segmenter` so abbreviations do not
 * split a claim; falls back to punctuation + newlines.
 */
export function splitSentences(text: string): TextSpan[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter("en", { granularity: "sentence" });
    return [...seg.segment(text)].map((part) => ({
      start: part.index,
      end: part.index + part.segment.length,
    }));
  }
  const spans: TextSpan[] = [];
  const re = /[^.!?\n]+(?:[.!?]+|$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans.length > 0 ? spans : [{ start: 0, end: text.length }];
}

function lineSpan(text: string, pos: number): TextSpan {
  const start = pos <= 0 ? 0 : text.lastIndexOf("\n", pos - 1) + 1;
  const nl = text.indexOf("\n", pos);
  return { start, end: nl === -1 ? text.length : nl };
}

function isMarkdownTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("-")) return false;
  return /^[\s|:-]+$/.test(trimmed);
}

/**
 * GFM table cell containing `pos`, or null when `pos` is not inside a pipe row.
 */
export function markdownTableCellSpan(
  text: string,
  pos: number
): TextSpan | null {
  const line = lineSpan(text, pos);
  const raw = text.slice(line.start, line.end);
  if (!raw.includes("|")) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("|") && !trimmed.endsWith("|")) return null;
  if (!trimmed.startsWith("|")) return null;
  if (isMarkdownTableSeparator(raw)) return null;

  let cellStart = line.start;
  if (text[cellStart] === "|") cellStart += 1;
  while (cellStart <= line.end) {
    const pipe = text.indexOf("|", cellStart);
    const cellEnd = pipe === -1 || pipe > line.end ? line.end : pipe;
    if (pos >= cellStart && pos <= cellEnd) {
      return { start: cellStart, end: cellEnd };
    }
    if (pipe === -1 || pipe >= line.end) break;
    cellStart = pipe + 1;
  }
  return null;
}

/** Letters, digits, and token glue — not `.` (that is sentence punctuation). */
function isTokenChar(ch: string): boolean {
  return /[A-Za-z0-9%/\-]/.test(ch);
}

function isEmphasisCloser(ch: string): boolean {
  return ch === "*" || ch === "_" || ch === "~";
}

/**
 * Where a claim citation may land: the end of the word/token containing
 * `from` (after closing `**` / `*` / `_`), or the same index when `from`
 * is already a boundary. Table cells stay inside the pipe cell. Never a
 * mid-word index and never inside markdown emphasis.
 */
export function citationSiteOffset(text: string, from: number): number {
  if (!text) return 0;
  const pos = Math.max(0, Math.min(from, text.length));
  const cell = markdownTableCellSpan(text, pos);
  const limit = cell?.end ?? text.length;
  let i = Math.min(pos, limit);
  while (i < limit && isTokenChar(text[i]!)) i += 1;
  while (i < limit && isEmphasisCloser(text[i]!)) i += 1;
  return i;
}

/** Map an index in the original string after removing `[start, end)` ranges. */
export function mapIndexAfterRemovals(
  origIndex: number,
  removals: readonly TextSpan[]
): number {
  let idx = origIndex;
  const ordered = [...removals].sort((a, b) => b.start - a.start);
  for (const span of ordered) {
    if (span.end <= idx) idx -= span.end - span.start;
    else if (span.start < idx) idx = span.start;
  }
  return Math.max(0, idx);
}
