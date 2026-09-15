import { createHash } from "node:crypto";
import type { UIMessage } from "ai";
import { hasSupportedAttachmentExtension } from "@/lib/attachments/file-types";
import { resolveCitedAttachment } from "@/lib/citations/resolve-cited-attachment";
import {
  canonicalizeSourceCitationBracket,
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

export type RecordedCitationEvidence = {
  quote?: string;
  citationId?: string;
  sourceSha256?: string;
};

export type RecordedCitationPage = {
  id: string;
  filename: string;
  pageNumber: number;
  citationId: string;
  sourceSha256?: string;
  quote: string;
};

export type PageEvidenceRow = {
  attachmentId: string;
  filename: string;
  pageNumber: number;
  quote: string;
  ingestRunId?: string;
  citationId?: string;
  sourceSha256?: string;
};

export type PageEvidenceLoader = (
  pages: Array<{ attachmentId: string; pageNumber: number }>
) => Promise<PageEvidenceRow[]>;

function pageKey(attachmentId: string, pageNumber: number): string {
  return `${attachmentId}:${pageNumber}`;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Pages retrieval actually served this turn (and prior turns, once seeded),
 * including the served quote when known. Used to drop invented `p. N` and to
 * gate hard facts against evidence, not just filenames.
 */
export class CitationPageLedger {
  private readonly files: RecordedCitationFile[] = [];
  private readonly pagesById = new Map<string, Set<number>>();
  private readonly evidenceByKey = new Map<string, RecordedCitationPage>();
  private nextSyntheticId = 0;

  record(
    filename: string,
    pageNumber: number,
    attachmentId?: string | null,
    evidence?: RecordedCitationEvidence
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
    const key = pageKey(id, pageNumber);
    const quote = evidence?.quote?.trim() ?? "";
    const existing = this.evidenceByKey.get(key);
    const nextQuote = quote || existing?.quote || "";
    const citationId =
      evidence?.citationId?.trim() ||
      existing?.citationId ||
      `att:${id}:p:${pageNumber}`;
    const sourceSha256 =
      evidence?.sourceSha256 ||
      existing?.sourceSha256 ||
      (nextQuote ? sha256(nextQuote) : undefined);
    this.evidenceByKey.set(key, {
      id,
      filename: name,
      pageNumber,
      citationId,
      sourceSha256,
      quote: nextQuote,
    });
  }

  hasRecordedPages(): boolean {
    for (const pages of this.pagesById.values()) {
      if (pages.size > 0) return true;
    }
    return false;
  }

  /** True when at least one recorded page has served text to match against. */
  hasQuotedPages(): boolean {
    for (const page of this.evidenceByKey.values()) {
      if (page.quote.trim()) return true;
    }
    return false;
  }

  recordedPages(): RecordedCitationPage[] {
    return [...this.evidenceByKey.values()];
  }

  pagesMissingQuotes(): Array<{ attachmentId: string; pageNumber: number }> {
    const missing: Array<{ attachmentId: string; pageNumber: number }> = [];
    for (const page of this.evidenceByKey.values()) {
      if (page.quote.trim()) continue;
      missing.push({ attachmentId: page.id, pageNumber: page.pageNumber });
    }
    return missing;
  }

  async hydrateQuotes(loader: PageEvidenceLoader): Promise<void> {
    const missing = this.pagesMissingQuotes();
    if (missing.length === 0) return;
    try {
      const rows = await loader(missing);
      for (const row of rows) {
        this.record(row.filename, row.pageNumber, row.attachmentId, {
          quote: row.quote,
          citationId: row.citationId,
          sourceSha256: row.sourceSha256,
        });
      }
    } catch (err) {
      console.error("citation ledger: failed to hydrate page quotes", err);
    }
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
    collectPagesFromToolOutput(
      output,
      (filename, page, attachmentId, evidence) => {
        this.record(filename, page, attachmentId, evidence);
      }
    );
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
 * for that file. When the ledger has any recorded pages, attachment-like
 * cites (`.pdf` / `.docx`) for files never retrieved are dropped entirely.
 * Empty ledger and appendix-style cites fail open.
 */
export function rewriteCitationPagesInText(
  text: string,
  ledger: CitationPageLedger
): string {
  if (!text) return text;
  BRACKET_RE.lastIndex = 0;
  const rewritten = text.replace(BRACKET_RE, (match) => {
    if (!isSourceCitationBracket(match)) return match;
    return rewriteSourceCitationBracket(match, ledger);
  });
  return tidyDroppedCitations(text, rewritten);
}

export function rewriteTableOperationCitations(
  operation: TableOperation,
  ledger: CitationPageLedger
): TableOperation {
  return mapTableOperationText(operation, (value) =>
    rewriteCitationPagesInText(value, ledger)
  );
}

export function mapTableOperationText(
  operation: TableOperation,
  rewrite: (value: string) => string
): TableOperation {
  switch (operation.kind) {
    case "edit_cells":
      return {
        ...operation,
        cells: operation.cells.map((cell) => ({
          ...cell,
          insertText: rewrite(cell.insertText),
        })),
      };
    case "insert_rows":
      return {
        ...operation,
        rows: operation.rows.map((row) => row.map((cell) => rewrite(cell))),
      };
    case "insert_column":
      return {
        ...operation,
        header: rewrite(operation.header),
        values: operation.values?.map((value) => rewrite(value)),
      };
    case "create_table":
      return {
        ...operation,
        headers: operation.headers.map((header) => rewrite(header)),
        rows: operation.rows?.map((row) => row.map((cell) => rewrite(cell))),
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
  const rewritten = parts
    .map((part) => rewriteCitationPart(part, ledger))
    .filter((part) => part.trim().length > 0);
  if (rewritten.length === 0) return "";
  return canonicalizeSourceCitationBracket(`[${rewritten.join(", ")}]`);
}

function rewriteCitationPart(
  part: string,
  ledger: CitationPageLedger
): string {
  const parsed = parseSourceCitation(`[${part}]`);
  if (!parsed) return part;
  if (parsed.pages.length === 0) {
    if (
      ledger.hasRecordedPages() &&
      looksLikeAttachmentFilename(parsed.filename) &&
      ledger.decision(parsed.filename, 1) === "unknown"
    ) {
      return "";
    }
    return part;
  }
  const kept: number[] = [];
  let dropped = false;
  let unknownAttachment = false;
  for (const page of parsed.pages) {
    const decision = ledger.decision(parsed.filename, page);
    if (decision === "keep") {
      kept.push(page);
      continue;
    }
    if (decision === "drop") {
      dropped = true;
      continue;
    }
    if (
      ledger.hasRecordedPages() &&
      looksLikeAttachmentFilename(parsed.filename)
    ) {
      unknownAttachment = true;
      dropped = true;
      continue;
    }
    kept.push(page);
  }
  if (unknownAttachment && kept.length === 0) return "";
  if (!dropped) return part;
  if (kept.length === 0) return parsed.filename;
  return `${parsed.filename}, p. ${kept.join(", ")}`;
}

function looksLikeAttachmentFilename(filename: string): boolean {
  return hasSupportedAttachmentExtension(filename);
}

function tidyDroppedCitations(original: string, rewritten: string): string {
  if (rewritten === original) return rewritten;
  return rewritten
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:!?])/g, "$1")
    .replace(/\( +\)/g, "");
}

function collectPagesFromToolOutput(
  output: unknown,
  record: (
    filename: string,
    page: number,
    attachmentId?: string | null,
    evidence?: RecordedCitationEvidence
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
    const quote = quoteFromToolRow(rec);
    const citationId =
      typeof rec.citationId === "string" ? rec.citationId : undefined;
    if (filename && pageNumber != null) {
      record(filename, pageNumber, attachmentId, {
        quote,
        citationId,
      });
    }
    if (typeof rec.citation === "string") {
      const parsed = parseSourceCitation(rec.citation);
      if (parsed) {
        for (const page of parsed.pages) {
          record(parsed.filename, page, attachmentId, { quote, citationId });
        }
      }
    }
  };

  const rec = root as Record<string, unknown>;
  recordRow(rec);
  for (const key of [
    "reviewedEvidence",
    "results",
    "seenPages",
    "citationDigest",
    "findings",
  ] as const) {
    const list = rec[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) recordRow(item);
  }
  if (rec.page && typeof rec.page === "object" && !Array.isArray(rec.page)) {
    recordRow(rec.page);
  }
}

function quoteFromToolRow(rec: Record<string, unknown>): string {
  const nested =
    rec.page && typeof rec.page === "object" && !Array.isArray(rec.page)
      ? (rec.page as Record<string, unknown>)
      : null;
  const pieces: string[] = [];
  for (const value of [
    rec.quote,
    rec.text,
    rec.transcript,
    rec.snippet,
    rec.summary,
    rec.result,
    rec.configuration,
    rec.visualInterpretation,
    nested?.transcript,
    nested?.visualInterpretation,
    nested?.quote,
    nested?.snippet,
  ]) {
    if (typeof value === "string" && value.trim()) pieces.push(value);
  }
  if (Array.isArray(rec.identifiers)) {
    const ids = rec.identifiers.filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0
    );
    if (ids.length > 0) pieces.push(ids.join(" "));
  }
  return pieces.join("\n");
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
