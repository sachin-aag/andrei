import { resolveCitedAttachment } from "@/lib/citations/resolve-cited-attachment";
import {
  parseSourceCitation,
  type ParsedSourceCitation,
} from "@/lib/placeholders/citation-bracket";
import { extractCitationBrackets } from "@/lib/suggestions/citations-at-end";
import type { TableOperation } from "@/lib/suggestions/table-operation";

export type ReadyAttachmentForCitations = {
  id: string;
  filename: string;
  pageCount: number | null;
};

export type OutOfRangeCitation = {
  raw: string;
  filename: string;
  page: number;
  pageCount: number;
};

export function parsedCitationsInText(text: string): ParsedSourceCitation[] {
  const out: ParsedSourceCitation[] = [];
  for (const raw of extractCitationBrackets(text)) {
    const parsed = parseSourceCitation(raw);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function outOfRangeCitations(
  texts: readonly string[],
  attachments: readonly ReadyAttachmentForCitations[]
): OutOfRangeCitation[] {
  const violations: OutOfRangeCitation[] = [];
  const seen = new Set<string>();

  for (const text of texts) {
    for (const parsed of parsedCitationsInText(text)) {
      if (parsed.pages.length === 0) continue;

      const resolved = resolveCitedAttachment(attachments, parsed.filename);
      if (resolved.status !== "found") continue;

      const attachment = attachments.find(
        (item) => item.id === resolved.attachment.id
      );
      const pageCount = attachment?.pageCount;
      if (pageCount == null || pageCount < 1) continue;

      for (const page of parsed.pages) {
        if (page < 1 || page > pageCount) {
          const raw = `[${parsed.filename}, p. ${page}]`;
          const key = `${resolved.attachment.id}:${page}`;
          if (seen.has(key)) continue;
          seen.add(key);
          violations.push({
            raw,
            filename: resolved.attachment.filename,
            page,
            pageCount,
          });
        }
      }
    }
  }

  return violations;
}

export function citationOutOfRangeMessage(
  violations: readonly OutOfRangeCitation[]
): string {
  const first = violations[0];
  if (!first) {
    return "A citation page number is out of range for the attached file. Copy the citation field from a tool result.";
  }
  return `${first.raw} — ${first.filename} has ${first.pageCount} pages. Cite the absolute PDF page position from a tool result's citation field, not a printed page number from the document footer.`;
}

export function tableOperationCitationTexts(operation: TableOperation): string[] {
  switch (operation.kind) {
    case "edit_cells":
      return operation.cells.map((cell) => cell.insertText);
    case "insert_rows":
      return operation.rows.flat();
    case "insert_column":
      return [
        operation.header,
        ...(operation.values ?? []),
      ];
    case "create_table":
      return [
        ...operation.headers,
        ...(operation.rows?.flat() ?? []),
      ];
    case "delete_rows":
    case "delete_column":
    case "delete_table":
      return [];
    default: {
      const _exhaustive: never = operation;
      return _exhaustive;
    }
  }
}
