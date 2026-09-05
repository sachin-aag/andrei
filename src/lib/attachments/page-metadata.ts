import { requirementIds } from "@/lib/attachments/ocr-quality";
import {
  buildOutlineFromStoredPages,
  derivePageMetadata,
  PAGE_IDENTIFIER_STORE_CAP,
} from "@/lib/attachments/page-outline";

export { PAGE_IDENTIFIER_STORE_CAP };

export type VisualPresenceFlags = {
  hasTable: boolean | null;
  hasFigure: boolean | null;
};

/**
 * `classified: false` means this page never went through Gemini insight/vision
 * (OCR wave, text-layer-only, gap). Store null — not “no table”.
 */
export function visualPresenceFlags(input: {
  classified: boolean;
  tables?: readonly string[];
  figures?: readonly string[];
}): VisualPresenceFlags {
  if (!input.classified) {
    return { hasTable: null, hasFigure: null };
  }
  return {
    hasTable: (input.tables?.length ?? 0) > 0,
    hasFigure: (input.figures?.length ?? 0) > 0,
  };
}

export function mergeVisualPresenceFlags(
  parts: readonly VisualPresenceFlags[]
): VisualPresenceFlags {
  return {
    hasTable: mergeNullableBool(parts.map((part) => part.hasTable)),
    hasFigure: mergeNullableBool(parts.map((part) => part.hasFigure)),
  };
}

function mergeNullableBool(values: readonly (boolean | null)[]): boolean | null {
  if (values.every((value) => value == null)) return null;
  return values.some((value) => value === true);
}

export function pageRetrievalColumns(transcript: string): {
  outlineTitle: string | null;
  identifiers: string[];
} {
  const meta = derivePageMetadata(transcript);
  return {
    outlineTitle: meta.outlineTitle,
    identifiers: meta.identifiers,
  };
}

export function pageIdentifiersFromTranscript(transcript: string): string[] {
  return requirementIds(transcript).slice(0, PAGE_IDENTIFIER_STORE_CAP);
}

export type OutlineSpanRowInput = {
  ordinal: number;
  title: string;
  pageStart: number;
  pageEnd: number;
  identifiers: string[];
};

export function buildOutlineSpanRows(
  pages: readonly {
    pageNumber: number;
    printedPageLabel?: string | null;
    pageContext: string | null;
    transcript: string | null;
    identifiers?: readonly string[] | null;
  }[]
): OutlineSpanRowInput[] {
  const outline = buildOutlineFromStoredPages(pages);
  const identifiersByPage = new Map<number, string[]>();
  for (const page of pages) {
    const stored = page.identifiers ?? [];
    identifiersByPage.set(
      page.pageNumber,
      stored.length > 0
        ? [...stored]
        : pageIdentifiersFromTranscript(page.transcript ?? "")
    );
  }
  return outline.spans.map((span, ordinal) => {
    const identifiers = new Set<string>();
    for (let page = span.pageStart; page <= span.pageEnd; page += 1) {
      for (const id of identifiersByPage.get(page) ?? []) {
        identifiers.add(id);
      }
    }
    return {
      ordinal,
      title: span.title,
      pageStart: span.pageStart,
      pageEnd: span.pageEnd,
      identifiers: [...identifiers],
    };
  });
}

export function toDocumentPageRetrievalFields(input: {
  transcript: string;
  hasTable?: boolean | null;
  hasFigure?: boolean | null;
}): {
  outlineTitle: string | null;
  identifiers: string[];
  hasTable: boolean | null;
  hasFigure: boolean | null;
} {
  const retrieval = pageRetrievalColumns(input.transcript);
  return {
    outlineTitle: retrieval.outlineTitle,
    identifiers: retrieval.identifiers,
    hasTable: input.hasTable ?? null,
    hasFigure: input.hasFigure ?? null,
  };
}
