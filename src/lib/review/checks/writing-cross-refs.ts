import {
  flattenTableOfContents,
  getReportTableOfContents,
} from "@/lib/document-types/convergent/table-of-contents";
import { iterReportFields } from "../fields";
import type { ReviewCheckResult, ReviewFindingDraft, ReviewRunContext } from "../types";

const TABLE_CAPTION_RE = /\bTable\s+(\d+)\./gi;
const TABLE_MENTION_RE = /\bTable\s+(\d+)\b/gi;
const SECTION_MENTION_RE = /\bSection\s+(\d+(?:\.\d+)*)\b/gi;
const OUTLINE_NUMBER_RE = /^(\d+(?:\.\d+)*)/;

export function crossReferenceFindings(
  ctx: Pick<ReviewRunContext, "documentType" | "sections">
): ReviewFindingDraft[] {
  const numbered = new Set<number>();
  for (const field of iterReportFields(ctx.documentType, ctx.sections)) {
    TABLE_CAPTION_RE.lastIndex = 0;
    let caption: RegExpExecArray | null;
    while ((caption = TABLE_CAPTION_RE.exec(field.text)) !== null) {
      numbered.add(Number(caption[1]));
    }
  }

  const outlineNums = new Set<string>();
  for (const entry of flattenTableOfContents(
    getReportTableOfContents(ctx.documentType)
  )) {
    const n = OUTLINE_NUMBER_RE.exec(entry.label)?.[1];
    if (n) outlineNums.add(n);
  }

  const findings: ReviewFindingDraft[] = [];
  for (const field of iterReportFields(ctx.documentType, ctx.sections)) {
    TABLE_MENTION_RE.lastIndex = 0;
    let tableMatch: RegExpExecArray | null;
    while ((tableMatch = TABLE_MENTION_RE.exec(field.text)) !== null) {
      const n = Number(tableMatch[1]);
      if (!Number.isInteger(n) || numbered.has(n)) continue;
      findings.push({
        section: field.section,
        contentPath: field.contentPath,
        anchorText: tableMatch[0],
        message: `${tableMatch[0]} does not resolve to a filled table in this document.`,
        severity: "minor",
        kind: "needs_human",
      });
    }

    SECTION_MENTION_RE.lastIndex = 0;
    let sectionMatch: RegExpExecArray | null;
    while ((sectionMatch = SECTION_MENTION_RE.exec(field.text)) !== null) {
      const n = sectionMatch[1]!;
      if ([...outlineNums].some((key) => key === n || n.startsWith(`${key}.`) || key.startsWith(`${n}.`))) {
        continue;
      }
      findings.push({
        section: field.section,
        contentPath: field.contentPath,
        anchorText: sectionMatch[0],
        message: `${sectionMatch[0]} does not match a section in this document.`,
        severity: "minor",
        kind: "needs_human",
      });
    }
  }
  return findings;
}

export async function runCrossReferencesCheck(
  ctx: ReviewRunContext
): Promise<ReviewCheckResult> {
  return { findings: crossReferenceFindings(ctx) };
}
