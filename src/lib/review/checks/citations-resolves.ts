import {
  canonicalizeSourceCitationBracket,
  citationNumbersFromMarker,
  formatNumericCitationMarker,
  isNumericCitationMarker,
  parseSourceCitation,
} from "@/lib/placeholders/citation-bracket";
import {
  blocksAfterCitationList,
  formatCitationList,
  misplacedCitationListInText,
  sourceCitationForNumber,
  type MisplacedCitationList,
} from "@/lib/suggestions/citations-at-end";
import { iterReportFields, type ReviewField } from "../fields";
import { locateFieldsForMatch } from "../locate";
import { withProposedEdit } from "../locate-proposed-edit";
import type { ReviewCheckResult, ReviewFindingDraft, ReviewRunContext } from "../types";

const NUMERIC_MARKER_RE = /\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g;

/** Placeholder the Placeholders tab lists until someone adds the source. */
export const MISSING_CITATION = "<citation>";

export type AttachmentPageIndex = {
  filenames: Set<string>;
  pages: Set<string>;
};

function filenameKey(name: string): string {
  return name.trim().toLowerCase();
}

function pageKey(filename: string, page: number): string {
  return `${filenameKey(filename)}:${page}`;
}

export function attachmentIndexFrom(
  rows: Array<{ filename: string; pageNumber: number | null }>
): AttachmentPageIndex {
  const filenames = new Set<string>();
  const pages = new Set<string>();
  for (const row of rows) {
    filenames.add(filenameKey(row.filename));
    if (row.pageNumber != null) {
      pages.add(pageKey(row.filename, row.pageNumber));
    }
  }
  return { filenames, pages };
}

const CITATIONS_HEADING_LINE_RE = /^#{0,6}[ \t]*citations[ \t]*:?[ \t]*$/gim;

/** Offset just past the last `Citations` heading line, or -1. */
function citationsBlockStart(text: string): number {
  let start = -1;
  CITATIONS_HEADING_LINE_RE.lastIndex = 0;
  let heading: RegExpExecArray | null;
  while ((heading = CITATIONS_HEADING_LINE_RE.exec(text)) !== null) {
    start = heading.index + heading[0].length;
  }
  return start;
}

/**
 * A Citations line typed as `[3] file.pdf, p. 2` or `3) file.pdf, p. 2`,
 * which the Citations parser does not read. `canonical` is the `3. [file]`
 * form it does read.
 */
export function looseCitationLine(
  fieldText: string,
  n: number
): { start: number; line: string; canonical: string } | null {
  const blockStart = citationsBlockStart(fieldText);
  if (blockStart < 0) return null;
  const block = fieldText.slice(blockStart);
  const re = new RegExp(
    `^[ \\t]*(?:\\[[ \\t]*${n}[ \\t]*\\]|${n}[.)])[ \\t]+(.+?)[ \\t]*$`,
    "m"
  );
  const found = re.exec(block);
  if (!found) return null;
  const source = found[1]!.replace(/^\[|\]$/g, "").trim();
  if (!source) return null;
  const line = found[0].trim();
  return {
    start: blockStart + found.index + found[0].indexOf(line),
    line,
    canonical: `${n}. ${canonicalizeSourceCitationBracket(`[${source}]`)}`,
  };
}

/**
 * Move the text below a misplaced Citations list above it. Rich fields only
 * get the edit when that text is plain paragraphs, which a text edit can
 * rebuild without losing structure.
 */
function misplacedListFinding(
  ctx: Pick<ReviewRunContext, "sections">,
  field: ReviewField,
  misplaced: MisplacedCitationList
): ReviewFindingDraft {
  const deleteText = field.text.slice(misplaced.start).trimEnd();
  const located = locateFieldsForMatch(field.text, misplaced.start, deleteText);
  const finding: ReviewFindingDraft = {
    section: field.section,
    contentPath: field.contentPath,
    anchorText: located.anchorText,
    message:
      "The Citations list is not at the end of this field, so its numbers are not linked to the [n] markers. Move the text below it above the list.",
    severity: "major",
    kind: "needs_human",
    metadata: { citationListMisplaced: true, ...located.metadata },
  };
  const movable =
    !field.rich ||
    (field.doc != null &&
      blocksAfterCitationList(field.doc).every((block) => block.type === "paragraph"));
  if (!movable) return finding;
  const after = field.rich
    ? misplaced.after.split(/\n+/).map((line) => line.trim()).filter(Boolean).join("\n\n")
    : misplaced.after;
  return withProposedEdit(ctx, finding, {
    deleteText,
    insertText: `${after}\n\n${formatCitationList(misplaced.entries)}`,
  });
}

export function citationResolveFindings(
  ctx: Pick<ReviewRunContext, "documentType" | "sections">,
  index: AttachmentPageIndex
): ReviewFindingDraft[] {
  const findings: ReviewFindingDraft[] = [];
  for (const field of iterReportFields(ctx.documentType, ctx.sections)) {
    const body = field.text;
    const misplaced = misplacedCitationListInText(body);
    const misplacedSources = new Map(
      (misplaced?.entries ?? []).map(({ number, source }) => [number, source])
    );
    const sourceFor = (n: number) =>
      sourceCitationForNumber(body, n) ?? misplacedSources.get(n) ?? null;
    const blockStart = misplaced ? misplaced.start : citationsBlockStart(body);
    const blockEnd = misplaced ? misplaced.listEnd : body.length;
    if (misplaced) findings.push(misplacedListFinding(ctx, field, misplaced));
    const looseReported = new Set<number>();
    NUMERIC_MARKER_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = NUMERIC_MARKER_RE.exec(body)) !== null) {
      if (!isNumericCitationMarker(match[0])) continue;
      if (blockStart >= 0 && match.index >= blockStart && match.index < blockEnd) {
        continue;
      }
      const located = locateFieldsForMatch(body, match.index, match[0]);
      const numbers = citationNumbersFromMarker(match[0]);
      const listed = numbers.filter((n) => sourceFor(n));
      for (const n of numbers) {
        const source = sourceFor(n);
        const loose = source ? null : looseCitationLine(body, n);
        if (loose) {
          if (looseReported.has(n)) continue;
          looseReported.add(n);
          const lineLocated = locateFieldsForMatch(body, loose.start, loose.line);
          findings.push(
            withProposedEdit(
              ctx,
              {
                section: field.section,
                contentPath: field.contentPath,
                anchorText: lineLocated.anchorText,
                message: `Citations line “${loose.line}” is not in the “${loose.canonical}” form, so ${formatNumericCitationMarker([n])} does not resolve.`,
                severity: "critical",
                kind: "needs_human",
                metadata: { citationNumber: n, ...lineLocated.metadata },
              },
              { deleteText: loose.line, insertText: loose.canonical }
            )
          );
          continue;
        }
        if (!source) {
          const kept = formatNumericCitationMarker(listed);
          findings.push(
            withProposedEdit(
              ctx,
              {
                section: field.section,
                contentPath: field.contentPath,
                anchorText: located.anchorText,
                message: `${match[0]} has no matching line in the Citations list.`,
                severity: "critical",
                kind: "needs_human",
                metadata: { citationNumber: n, ...located.metadata },
              },
              {
                deleteText: match[0],
                insertText: kept ? `${kept} ${MISSING_CITATION}` : MISSING_CITATION,
              }
            )
          );
          continue;
        }
        const parsed = parseSourceCitation(source, [...index.filenames]);
        if (!parsed) {
          findings.push({
            section: field.section,
            contentPath: field.contentPath,
            anchorText: located.anchorText,
            message: `${match[0]} maps to ${source}, which is not a parseable file citation. Please verify it.`,
            severity: "major",
            kind: "needs_human",
            metadata: { citationNumber: n, source, ...located.metadata },
          });
          continue;
        }
        if (!index.filenames.has(filenameKey(parsed.filename))) {
          findings.push({
            section: field.section,
            contentPath: field.contentPath,
            anchorText: located.anchorText,
            message: `${match[0]} cites ${parsed.filename}, which is not an attached file. Please verify it.`,
            severity: "critical",
            kind: "needs_human",
            metadata: { citationNumber: n, source, ...located.metadata },
          });
          continue;
        }
        const page = parsed.pages[0];
        if (page != null && !index.pages.has(pageKey(parsed.filename, page))) {
          findings.push({
            section: field.section,
            contentPath: field.contentPath,
            anchorText: located.anchorText,
            message: `${match[0]} cites ${parsed.filename} p. ${page}, which is not a ready page. Please verify it.`,
            severity: "critical",
            kind: "needs_human",
            metadata: { citationNumber: n, source, page, ...located.metadata },
          });
        }
      }
    }
  }
  return findings;
}

export async function runCitationResolvesCheck(
  ctx: ReviewRunContext,
  index: AttachmentPageIndex
): Promise<ReviewCheckResult> {
  return { findings: citationResolveFindings(ctx, index) };
}
