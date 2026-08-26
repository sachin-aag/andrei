import type { DocumentChunkSourceKind } from "@/db/schema";
import {
  derivePageOutlineDigest,
  usefulPageContext,
} from "@/lib/attachments/page-outline";

export const DEFAULT_CHUNK_MAX_CHARS = 3_200;
export const DEFAULT_CHUNK_OVERLAP_CHARS = 240;

export type ChunkablePage = {
  id: string;
  pageNumber: number;
  transcript: string;
  visualInterpretation: string;
  pageContext: string | null;
};

export type DocumentChunkInput = {
  pageId: string;
  pageNumber: number;
  ordinal: number;
  rawText: string;
  contextualText: string;
  sourceKind: DocumentChunkSourceKind;
};

export function chunkDocumentPages(input: {
  filename: string;
  pages: ChunkablePage[];
  maxChars?: number;
  overlapChars?: number;
}): DocumentChunkInput[] {
  const maxChars = input.maxChars ?? DEFAULT_CHUNK_MAX_CHARS;
  const overlapChars = input.overlapChars ?? DEFAULT_CHUNK_OVERLAP_CHARS;
  const chunks: DocumentChunkInput[] = [];

  for (const page of input.pages) {
    let ordinal = 0;
    for (const source of pageSources(page)) {
      const textChunks = splitText(source.text, { maxChars, overlapChars });
      for (const rawText of textChunks) {
        chunks.push({
          pageId: page.id,
          pageNumber: page.pageNumber,
          ordinal,
          rawText,
          contextualText: contextualizeChunk({
            filename: input.filename,
            page,
            rawText,
          }),
          sourceKind: source.kind,
        });
        ordinal += 1;
      }
    }
  }

  return chunks;
}

function pageSources(page: ChunkablePage): Array<{
  kind: DocumentChunkSourceKind;
  text: string;
}> {
  const sources: Array<{
    kind: DocumentChunkSourceKind;
    text: string;
  }> = [
    { kind: "quote", text: page.transcript },
    { kind: "visual_interpretation", text: page.visualInterpretation },
  ];
  return sources.filter((source) => source.text.trim().length > 0);
}

function contextualizeChunk(input: {
  filename: string;
  page: ChunkablePage;
  rawText: string;
}): string {
  const pageContext =
    usefulPageContext(input.page.pageContext) ||
    derivePageOutlineDigest(input.page.transcript) ||
    "No page context provided";
  return `Document: ${input.filename} | Page ${input.page.pageNumber} | ${pageContext}\n\n${input.rawText}`;
}

const CHUNK_DOCUMENT_HEADER_RE = /^Document: .+? \| Page (\d+) \|/;

/**
 * Search snippets keep the ingest-time `Document: filename | Page N |`
 * prefix. After a rename the live attachment name can diverge — rewrite
 * the header so chat cites the current filename. Page number is preserved.
 */
export function rewriteChunkDocumentHeader(
  text: string,
  filename: string
): string {
  const trimmed = filename.trim();
  if (!trimmed) return text;
  const match = CHUNK_DOCUMENT_HEADER_RE.exec(text);
  if (!match) return text;
  return text.replace(CHUNK_DOCUMENT_HEADER_RE, `Document: ${trimmed} | Page ${match[1]} |`);
}

function splitText(
  text: string,
  options: { maxChars: number; overlapChars: number }
): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!normalized) return [];
  if (normalized.length <= options.maxChars) return [normalized];

  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > options.maxChars) {
    const splitAt = findSplitPoint(remaining, options.maxChars);
    const chunk = remaining.slice(0, splitAt).trim();
    if (chunk) chunks.push(chunk);

    const overlapStart = Math.max(0, splitAt - options.overlapChars);
    remaining = remaining.slice(overlapStart).trim();
    if (remaining === chunk) break;
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function findSplitPoint(text: string, maxChars: number): number {
  const paragraphBreak = text.lastIndexOf("\n\n", maxChars);
  if (paragraphBreak >= Math.floor(maxChars * 0.5)) return paragraphBreak;

  const sentenceBreak = Math.max(
    text.lastIndexOf(". ", maxChars),
    text.lastIndexOf("? ", maxChars),
    text.lastIndexOf("! ", maxChars)
  );
  if (sentenceBreak >= Math.floor(maxChars * 0.5)) return sentenceBreak + 1;

  const whitespace = text.lastIndexOf(" ", maxChars);
  if (whitespace >= Math.floor(maxChars * 0.5)) return whitespace;
  return maxChars;
}
