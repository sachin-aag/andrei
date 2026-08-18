import { requirementIds } from "@/lib/attachments/ocr-quality";

export const PAGE_OUTLINE_MAX_CHARS = 400;
export const PAGE_OUTLINE_EXCERPT_CHARS = 180;

const RECURRING_LINE_MIN_PAGES = 3;
const RECURRING_LINE_SHARE = 0.3;
const RECURRING_LINE_MAX_CHARS = 80;

const BOILERPLATE_LINE_RE =
  /^(confidential|proprietary|page\s+\d+|printed on|©|\(c\)|convergent\s*dental|solea|all rights reserved)/i;

export type OutlineSpan = {
  title: string;
  pageStart: number;
  pageEnd: number;
};

export type OutlinePageInput = {
  pageNumber: number;
  digest: string;
};

/**
 * Lines that repeat across many pages (running headers/footers) so they can
 * be stripped before a page digest is built.
 */
export function detectRecurringBoilerplate(
  transcripts: readonly string[]
): Set<string> {
  if (transcripts.length < RECURRING_LINE_MIN_PAGES) return new Set();
  const counts = new Map<string, number>();
  for (const transcript of transcripts) {
    const seen = new Set<string>();
    for (const line of splitLines(transcript)) {
      const key = normalizeLine(line);
      if (!key || key.length > RECURRING_LINE_MAX_CHARS) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const threshold = Math.max(
    RECURRING_LINE_MIN_PAGES,
    Math.ceil(transcripts.length * RECURRING_LINE_SHARE)
  );
  const recurring = new Set<string>();
  for (const [line, count] of counts) {
    if (count >= threshold) recurring.add(line);
  }
  return recurring;
}

/**
 * Empty or page-index-only context ("Page 4 Page 5 Page 6") is not useful as a
 * digest; callers should fall back to the transcript.
 */
export function isPlaceholderPageContext(
  value: string | null | undefined
): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return true;
  return /^(Page \d+\s*)+$/i.test(trimmed);
}

export function usefulPageContext(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return isPlaceholderPageContext(trimmed) ? "" : trimmed;
}

export function buildOutlineFromStoredPages(
  pages: readonly {
    pageNumber: number;
    printedPageLabel?: string | null;
    pageContext: string | null;
    transcript: string | null;
  }[]
): {
  pages: Array<{
    pageNumber: number;
    printedPageLabel: string | null;
    pageContext: string | null;
  }>;
  spans: OutlineSpan[];
} {
  const transcripts = pages.map((page) => page.transcript ?? "");
  const recurring = detectRecurringBoilerplate(transcripts);
  const digested = pages.map((page) => {
    const stored = usefulPageContext(page.pageContext);
    const digest =
      stored ||
      derivePageOutlineDigest(page.transcript ?? "", {
        recurringLines: recurring,
      });
    return {
      pageNumber: page.pageNumber,
      printedPageLabel: page.printedPageLabel ?? null,
      pageContext: digest || null,
    };
  });
  return {
    pages: digested,
    spans: groupOutlineSpans(
      digested.map((page) => ({
        pageNumber: page.pageNumber,
        digest: page.pageContext ?? "",
      }))
    ),
  };
}

/**
 * Deterministic retrieval digest from OCR/text-layer transcript. Used for new
 * ingests (when Gemini pageContext is blank) and for already-ingested pages.
 */
export function derivePageOutlineDigest(
  transcript: string,
  options?: { recurringLines?: ReadonlySet<string> }
): string {
  const recurring = options?.recurringLines ?? new Set<string>();
  const kept = splitLines(transcript).filter(
    (line) => !isBoilerplateLine(line, recurring)
  );
  if (kept.length === 0) return "";

  const heading = detectHeading(kept);
  const ids = requirementIds(kept.join("\n")).slice(0, 8);
  const excerptSource = kept
    .filter((line) => line !== heading && !ids.includes(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const excerpt =
    excerptSource.length <= PAGE_OUTLINE_EXCERPT_CHARS
      ? excerptSource
      : `${excerptSource.slice(0, PAGE_OUTLINE_EXCERPT_CHARS).trimEnd()}…`;

  const parts = [heading, ids.join(" "), excerpt].filter(
    (part) => part && part.trim().length > 0
  );
  const joined = parts.join(" — ").replace(/\s+/g, " ").trim();
  if (!joined) return "";
  return joined.length <= PAGE_OUTLINE_MAX_CHARS
    ? joined
    : `${joined.slice(0, PAGE_OUTLINE_MAX_CHARS).trimEnd()}…`;
}

export function groupOutlineSpans(
  pages: readonly OutlinePageInput[]
): OutlineSpan[] {
  const spans: OutlineSpan[] = [];
  for (const page of pages) {
    const title = spanTitle(page.digest);
    const last = spans.length > 0 ? spans[spans.length - 1] : undefined;
    if (last && page.pageNumber === last.pageEnd + 1 && title === last.title) {
      last.pageEnd = page.pageNumber;
      continue;
    }
    spans.push({
      title,
      pageStart: page.pageNumber,
      pageEnd: page.pageNumber,
    });
  }
  return spans;
}

function splitLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim().toLowerCase();
}

function isBoilerplateLine(
  line: string,
  recurring: ReadonlySet<string>
): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (recurring.has(normalizeLine(trimmed))) return true;
  if (BOILERPLATE_LINE_RE.test(trimmed)) return true;
  if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(trimmed)) return true;
  if (/^\d+$/.test(trimmed)) return true;
  return false;
}

function detectHeading(lines: readonly string[]): string | null {
  for (const line of lines) {
    if (/^\d+(\.\d+)+\s+\S/.test(line)) return clip(line, 80);
    if (/^(table|figure|appendix)\b/i.test(line)) return clip(line, 80);
    if (isUppercaseHeading(line)) return clip(line, 80);
  }
  return null;
}

function isUppercaseHeading(line: string): boolean {
  if (line.length < 8 || line.length > 80) return false;
  if (line !== line.toUpperCase()) return false;
  if (!/[A-Z]/.test(line)) return false;
  if (/https?:\/\//i.test(line)) return false;
  return true;
}

function spanTitle(digest: string): string {
  const heading = digest.split(" — ")[0]?.trim() ?? "";
  if (heading.length >= 8) return clip(heading, 80);
  return clip(digest, 48) || "Untitled pages";
}

function clip(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}…`;
}
