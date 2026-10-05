import {
  citationNumbersFromMarker,
  isNumericCitationMarker,
  parseSourceCitation,
} from "@/lib/placeholders/citation-bracket";
import {
  sourceCitationForNumber,
} from "@/lib/suggestions/citations-at-end";
import { iterReportFields } from "../fields";
import type { ReviewCheckResult, ReviewFindingDraft, ReviewRunContext } from "../types";

const NUMERIC_MARKER_RE = /\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g;

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

export function citationResolveFindings(
  ctx: Pick<ReviewRunContext, "documentType" | "sections">,
  index: AttachmentPageIndex
): ReviewFindingDraft[] {
  const findings: ReviewFindingDraft[] = [];
  for (const field of iterReportFields(ctx.documentType, ctx.sections)) {
    const body = field.text;
    NUMERIC_MARKER_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = NUMERIC_MARKER_RE.exec(body)) !== null) {
      if (!isNumericCitationMarker(match[0])) continue;
      const numbers = citationNumbersFromMarker(match[0]);
      for (const n of numbers) {
        const source = sourceCitationForNumber(field.text, n);
        if (!source) {
          findings.push({
            section: field.section,
            contentPath: field.contentPath,
            anchorText: match[0],
            message: `${match[0]} has no matching line in the Citations list.`,
            severity: "critical",
            kind: "needs_human",
            metadata: { citationNumber: n },
          });
          continue;
        }
        const parsed = parseSourceCitation(source, [...index.filenames]);
        if (!parsed) {
          findings.push({
            section: field.section,
            contentPath: field.contentPath,
            anchorText: match[0],
            message: `${match[0]} maps to ${source}, which is not a parseable file citation. Please verify it.`,
            severity: "major",
            kind: "needs_human",
            metadata: { citationNumber: n, source },
          });
          continue;
        }
        if (!index.filenames.has(filenameKey(parsed.filename))) {
          findings.push({
            section: field.section,
            contentPath: field.contentPath,
            anchorText: match[0],
            message: `${match[0]} cites ${parsed.filename}, which is not an attached file. Please verify it.`,
            severity: "critical",
            kind: "needs_human",
            metadata: { citationNumber: n, source },
          });
          continue;
        }
        const page = parsed.pages[0];
        if (page != null && !index.pages.has(pageKey(parsed.filename, page))) {
          findings.push({
            section: field.section,
            contentPath: field.contentPath,
            anchorText: match[0],
            message: `${match[0]} cites ${parsed.filename} p. ${page}, which is not a ready page. Please verify it.`,
            severity: "critical",
            kind: "needs_human",
            metadata: { citationNumber: n, source, page },
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
