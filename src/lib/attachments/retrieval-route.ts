import {
  classifyRetrievalQuery,
  requestedFilenames,
} from "@/lib/attachments/retrieval-query";
import { filenameMatches } from "@/lib/attachments/retrieval-metrics";

export type RouteableDocument = {
  attachmentId: string;
  filename: string;
  documentSummary: string | null;
};

export type RouteableSpan = {
  attachmentId: string;
  pageStart: number;
  pageEnd: number;
  identifiers: readonly string[];
};

export type RoutedSearchTarget = {
  attachmentId: string;
  /** Inclusive. Null means the whole file. */
  pageStart: number | null;
  pageEnd: number | null;
};

function summaryHaystack(summary: string | null): string {
  return (summary ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function documentMatchesQuery(
  document: RouteableDocument,
  query: string
): boolean {
  const classified = classifyRetrievalQuery(query);
  const files = requestedFilenames(query);
  if (files.some((name) => filenameMatches(document.filename, name))) {
    return true;
  }
  const filename = document.filename.toLowerCase();
  if (
    classified.identifiers.some((id) => filename.includes(id.toLowerCase()))
  ) {
    return true;
  }
  const haystack = summaryHaystack(document.documentSummary);
  if (!haystack) return false;
  if (classified.identifiers.some((id) => haystack.includes(id.toLowerCase()))) {
    return true;
  }
  return files.some((name) => haystack.includes(name.toLowerCase()));
}

function spanMatchesQuery(span: RouteableSpan, query: string): boolean {
  const { identifiers } = classifyRetrievalQuery(query);
  if (identifiers.length === 0) return false;
  const stored = new Set(span.identifiers.map((id) => id.toLowerCase()));
  return identifiers.some((id) => stored.has(id.toLowerCase()));
}

/**
 * Phase 4: pick files / outline spans to search first for identifier and
 * locator queries. Semantic queries return nothing (search the whole report).
 * Empty output also means "do not restrict".
 */
export function routeSearchTargets(input: {
  query: string;
  documents: readonly RouteableDocument[];
  spans?: readonly RouteableSpan[];
}): RoutedSearchTarget[] {
  const classified = classifyRetrievalQuery(input.query);
  if (classified.kind === "semantic") return [];

  const spans = input.spans ?? [];
  const targets: RoutedSearchTarget[] = [];
  const seen = new Set<string>();

  const push = (target: RoutedSearchTarget) => {
    const key = `${target.attachmentId}:${target.pageStart ?? "*"}:${target.pageEnd ?? "*"}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push(target);
  };

  for (const span of spans) {
    if (!spanMatchesQuery(span, input.query)) continue;
    push({
      attachmentId: span.attachmentId,
      pageStart: span.pageStart,
      pageEnd: span.pageEnd,
    });
  }

  const spannedFiles = new Set(targets.map((target) => target.attachmentId));
  for (const document of input.documents) {
    if (spannedFiles.has(document.attachmentId)) continue;
    if (!documentMatchesQuery(document, input.query)) continue;
    push({
      attachmentId: document.attachmentId,
      pageStart: null,
      pageEnd: null,
    });
  }

  return targets;
}

export function routedAttachmentIds(
  targets: readonly RoutedSearchTarget[]
): string[] {
  return Array.from(new Set(targets.map((target) => target.attachmentId)));
}
