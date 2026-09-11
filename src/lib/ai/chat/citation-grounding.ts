import type { UIMessage } from "ai";
import { resolveCitedAttachment } from "@/lib/citations/resolve-cited-attachment";
import {
  isSourceCitationBracket,
  parseSourceCitation,
  splitSourceCitationParts,
} from "@/lib/placeholders/citation-bracket";
import type { TableOperation } from "@/lib/suggestions/table-operation";

const BRACKET_RE = /\[[^\]]+\]/g;

const LEDGER_TOOL_NAMES = new Set([
  "search_documents",
  "read_document_page",
  "finish_document_review",
]);

export type CitationPageDecision = "keep" | "drop" | "unknown";

export type RecordedCitationFile = {
  id: string;
  filename: string;
};

/**
 * Pages retrieval actually served this turn (and prior turns, once seeded).
 * Used to drop a `p. N` the model invented — typically a printed footer number —
 * without rejecting the draft. Files with no recorded pages fail open so a
 * missed seed cannot strip a correct cite.
 */
export class CitationPageLedger {
  private readonly files: RecordedCitationFile[] = [];
  private readonly pagesById = new Map<string, Set<number>>();
  private nextSyntheticId = 0;

  record(
    filename: string,
    pageNumber: number,
    attachmentId?: string | null
  ): void {
    const name = filename.trim();
    if (!name) return;
    if (!Number.isInteger(pageNumber) || pageNumber < 1) return;
    const id = attachmentId?.trim() || this.idForFilename(name);
    if (!this.files.some((file) => file.id === id)) {
      this.files.push({ id, filename: name });
    }
    let pages = this.pagesById.get(id);
    if (!pages) {
      pages = new Set();
      this.pagesById.set(id, pages);
    }
    pages.add(pageNumber);
  }

  seedFromMessages(messages: readonly UIMessage[]): void {
    for (const message of messages) {
      for (const part of message.parts ?? []) {
        const name = toolNameFromPart(part);
        if (!name || !LEDGER_TOOL_NAMES.has(name)) continue;
        const output = toolOutputFromPart(part);
        if (output != null) this.seedFromToolOutput(name, output);
      }
    }
  }

  seedFromToolOutput(toolName: string, output: unknown): void {
    if (!LEDGER_TOOL_NAMES.has(toolName)) return;
    collectPagesFromToolOutput(output, (filename, page, attachmentId) => {
      this.record(filename, page, attachmentId);
    });
  }

  decision(filename: string, page: number): CitationPageDecision {
    const resolved = resolveCitedAttachment(this.files, filename);
    if (resolved.status !== "found") return "unknown";
    const pages = this.pagesById.get(resolved.attachment.id);
    if (!pages || pages.size === 0) return "unknown";
    return pages.has(page) ? "keep" : "drop";
  }

  private idForFilename(filename: string): string {
    const resolved = resolveCitedAttachment(this.files, filename);
    if (resolved.status === "found") return resolved.attachment.id;
    this.nextSyntheticId += 1;
    return `cite-file:${this.nextSyntheticId}`;
  }
}

/**
 * Drop `p. N` that was never returned by search / page-read / document-review
 * for that file. Leaves the filename cite. Unknown files and files with no
 * recorded pages are unchanged (fail open).
 */
export function rewriteCitationPagesInText(
  text: string,
  ledger: CitationPageLedger
): string {
  if (!text) return text;
  BRACKET_RE.lastIndex = 0;
  return text.replace(BRACKET_RE, (match) => {
    if (!isSourceCitationBracket(match)) return match;
    return rewriteSourceCitationBracket(match, ledger);
  });
}

export function rewriteTableOperationCitations(
  operation: TableOperation,
  ledger: CitationPageLedger
): TableOperation {
  const take = (value: string): string =>
    rewriteCitationPagesInText(value, ledger);

  switch (operation.kind) {
    case "edit_cells":
      return {
        ...operation,
        cells: operation.cells.map((cell) => ({
          ...cell,
          insertText: take(cell.insertText),
        })),
      };
    case "insert_rows":
      return {
        ...operation,
        rows: operation.rows.map((row) => row.map((cell) => take(cell))),
      };
    case "insert_column":
      return {
        ...operation,
        header: take(operation.header),
        values: operation.values?.map((value) => take(value)),
      };
    case "create_table":
      return {
        ...operation,
        headers: operation.headers.map((header) => take(header)),
        rows: operation.rows?.map((row) => row.map((cell) => take(cell))),
      };
    case "delete_rows":
    case "delete_column":
    case "delete_table":
      return operation;
    default: {
      const _exhaustive: never = operation;
      return _exhaustive;
    }
  }
}

function rewriteSourceCitationBracket(
  match: string,
  ledger: CitationPageLedger
): string {
  const inner = match.slice(1, -1);
  const parts = splitSourceCitationParts(inner);
  if (parts.length === 0) return match;
  const rewritten = parts.map((part) => rewriteCitationPart(part, ledger));
  return `[${rewritten.join(", ")}]`;
}

function rewriteCitationPart(
  part: string,
  ledger: CitationPageLedger
): string {
  const parsed = parseSourceCitation(`[${part}]`);
  if (!parsed || parsed.pages.length === 0) return part;
  const kept: number[] = [];
  let dropped = false;
  for (const page of parsed.pages) {
    const decision = ledger.decision(parsed.filename, page);
    if (decision === "drop") {
      dropped = true;
      continue;
    }
    kept.push(page);
  }
  if (!dropped) return part;
  if (kept.length === 0) return parsed.filename;
  return `${parsed.filename}, p. ${kept.join(", ")}`;
}

function collectPagesFromToolOutput(
  output: unknown,
  record: (
    filename: string,
    page: number,
    attachmentId?: string | null
  ) => void
): void {
  const root = unwrapToolOutput(output);
  if (!root || typeof root !== "object" || Array.isArray(root)) return;
  const recordRow = (row: unknown) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return;
    const rec = row as Record<string, unknown>;
    const filename =
      typeof rec.filename === "string"
        ? rec.filename
        : typeof rec.page === "object" &&
            rec.page &&
            !Array.isArray(rec.page) &&
            typeof (rec.page as { filename?: unknown }).filename === "string"
          ? ((rec.page as { filename: string }).filename)
          : "";
    const pageNumber =
      typeof rec.pageNumber === "number"
        ? rec.pageNumber
        : typeof rec.page === "object" &&
            rec.page &&
            !Array.isArray(rec.page) &&
            typeof (rec.page as { pageNumber?: unknown }).pageNumber === "number"
          ? ((rec.page as { pageNumber: number }).pageNumber)
          : null;
    const attachmentId =
      typeof rec.attachmentId === "string"
        ? rec.attachmentId
        : typeof rec.page === "object" &&
            rec.page &&
            !Array.isArray(rec.page) &&
            typeof (rec.page as { attachmentId?: unknown }).attachmentId ===
              "string"
          ? ((rec.page as { attachmentId: string }).attachmentId)
          : null;
    if (filename && pageNumber != null) {
      record(filename, pageNumber, attachmentId);
    }
    if (typeof rec.citation === "string") {
      const parsed = parseSourceCitation(rec.citation);
      if (parsed) {
        for (const page of parsed.pages) {
          record(parsed.filename, page, attachmentId);
        }
      }
    }
  };

  const rec = root as Record<string, unknown>;
  recordRow(rec);
  for (const key of ["results", "seenPages", "citationDigest", "findings"] as const) {
    const list = rec[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) recordRow(item);
  }
  if (rec.page && typeof rec.page === "object" && !Array.isArray(rec.page)) {
    recordRow(rec.page);
  }
}

function unwrapToolOutput(output: unknown): unknown {
  if (typeof output === "string") {
    const trimmed = output.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  return output;
}

function toolNameFromPart(part: unknown): string | null {
  if (!part || typeof part !== "object") return null;
  const rec = part as { type?: unknown; toolName?: unknown };
  if (typeof rec.toolName === "string" && rec.toolName.trim()) {
    return rec.toolName;
  }
  if (typeof rec.type === "string" && rec.type.startsWith("tool-")) {
    const name = rec.type.slice("tool-".length);
    return name.length > 0 ? name : null;
  }
  return null;
}

function toolOutputFromPart(part: unknown): unknown {
  if (!part || typeof part !== "object") return null;
  return (part as { output?: unknown }).output;
}
