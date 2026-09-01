import { requirementIds } from "@/lib/attachments/ocr-quality";

const PAGE_LOCATOR_RE = /\b(?:page|p\.?)\s*\d+\b/i;
const FILE_LOCATOR_RE = /\.(pdf|docx)\b/i;

export type RetrievalQueryKind = "identifier" | "locator" | "semantic";

export type ClassifiedRetrievalQuery = {
  kind: RetrievalQueryKind;
  identifiers: string[];
};

export function classifyRetrievalQuery(query: string): ClassifiedRetrievalQuery {
  const trimmed = query.replace(/\s+/g, " ").trim();
  const identifiers = requirementIds(trimmed);
  if (identifiers.length > 0) {
    return { kind: "identifier", identifiers };
  }
  if (PAGE_LOCATOR_RE.test(trimmed) || FILE_LOCATOR_RE.test(trimmed)) {
    return { kind: "locator", identifiers: [] };
  }
  return { kind: "semantic", identifiers: [] };
}

export function searchPageKey(attachmentId: string, pageNumber: number): string {
  return `${attachmentId}:${pageNumber}`;
}

export function collapseToBestChunkPerPage<
  T extends { attachmentId: string; pageNumber: number },
>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const collapsed: T[] = [];
  for (const row of rows) {
    const key = searchPageKey(row.attachmentId, row.pageNumber);
    if (seen.has(key)) continue;
    seen.add(key);
    collapsed.push(row);
  }
  return collapsed;
}
