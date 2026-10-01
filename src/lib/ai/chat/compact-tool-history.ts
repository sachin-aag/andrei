import type { UIMessage } from "ai";
import { closeIncompleteChatToolHistory } from "@/lib/ai/chat/tool-part-repair";
import { sourceCitationBracket } from "@/lib/suggestions/citations-at-end";
import {
  TOOL_RESULT_BUDGET,
  toolResultBudget,
} from "@/lib/ai/chat/tool-result-budget";

/**
 * Prior tool rows can be hundreds of KB (page transcripts, finish findings,
 * worksheet write payloads). Re-sending that on the next turn blows the model
 * request and the assistant appears to "hit an error" with no new Langfuse
 * generation. Keep ids / counts / page-citation digests; drop bulky text and
 * value arrays.
 */

type ToolPartRecord = {
  type?: unknown;
  toolName?: unknown;
  output?: unknown;
};

function toolNameFromPart(part: ToolPartRecord): string | null {
  if (typeof part.toolName === "string" && part.toolName.trim()) {
    return part.toolName;
  }
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    const name = part.type.slice("tool-".length);
    return name.length > 0 ? name : null;
  }
  return null;
}

function parseToolOutput(output: unknown): {
  parsed: unknown;
  asString: boolean;
} | null {
  if (output == null) return null;
  if (typeof output === "string") {
    const trimmed = output.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    try {
      return { parsed: JSON.parse(trimmed) as unknown, asString: true };
    } catch {
      return null;
    }
  }
  if (typeof output === "object") {
    return { parsed: output, asString: false };
  }
  return null;
}

function emitOutput(
  original: unknown,
  next: unknown,
  asString: boolean
): unknown {
  if (asString) return JSON.stringify(next);
  return next;
}

/** Cap so a 273-page finish sample stays small across later turns. */
const FINISH_CITATION_DIGEST_CAP = TOOL_RESULT_BUDGET.finishFindings;

/**
 * Keep page-cited pointers for later draft turns. Full finding payloads are
 * huge; wiping them entirely made Agent/Document drafts drop `[filename, p. N]`
 * and thin out section prose once the finish tool scrolled out of the live turn.
 */
function citationDigestFromFindings(
  findings: readonly unknown[]
): Array<{
  filename: string;
  pageNumber: number;
  identifiers: string[];
  summary: string;
  citation: string;
}> {
  const digest: Array<{
    filename: string;
    pageNumber: number;
    identifiers: string[];
    summary: string;
    citation: string;
  }> = [];
  for (const finding of findings) {
    if (digest.length >= FINISH_CITATION_DIGEST_CAP) break;
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
      continue;
    }
    const row = finding as Record<string, unknown>;
    const filename =
      typeof row.filename === "string" ? row.filename.trim() : "";
    const pageNumber =
      typeof row.pageNumber === "number" && Number.isFinite(row.pageNumber)
        ? Math.trunc(row.pageNumber)
        : null;
    if (!filename || pageNumber == null || pageNumber < 1) continue;
    const identifiers = Array.isArray(row.identifiers)
      ? row.identifiers.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0
        )
      : [];
    const summaryRaw =
      typeof row.summary === "string"
        ? row.summary.trim()
        : typeof row.heading === "string"
          ? row.heading.trim()
          : "";
    const summary = toolResultBudget("finishSummary", summaryRaw);
    digest.push({
      filename,
      pageNumber,
      identifiers,
      summary,
      citation: sourceCitationBracket(filename, pageNumber),
    });
  }
  return digest;
}

function compactFinishOutput(output: unknown): unknown {
  const parsed = parseToolOutput(output);
  if (!parsed || !parsed.parsed || typeof parsed.parsed !== "object") {
    return output;
  }
  if (Array.isArray(parsed.parsed)) return output;
  const record = parsed.parsed as Record<string, unknown>;
  const findings = record.findings;
  if (!Array.isArray(findings) || findings.length === 0) return output;
  const citationDigest = citationDigestFromFindings(findings);
  const next = {
    ...record,
    findings: [],
    findingsOmitted: findings.length,
    citationDigest,
    // Keep every reviewed page pointer so later drafts can hydrate quotes.
    // Do not cap reviewedEvidence — it is ids only, not finding text.
    citationDigestNote:
      "Page-cited pointers only — copy [filename, p. N] from citationDigest when drafting. Full finding text was omitted to keep history small. reviewedEvidence lists every page the review walked so the server can ground facts that were not in the 60-finding sample.",
  };
  return emitOutput(output, next, parsed.asString);
}

function omitPageTranscripts(
  page: Record<string, unknown>
): { next: Record<string, unknown>; changed: boolean } {
  const transcript = page.transcript;
  const visual = page.visualInterpretation;
  const transcriptLen = typeof transcript === "string" ? transcript.length : 0;
  const visualLen = typeof visual === "string" ? visual.length : 0;
  if (transcriptLen === 0 && visualLen === 0) {
    return { next: page, changed: false };
  }
  return {
    next: {
      ...page,
      transcript: "",
      visualInterpretation: "",
      transcriptOmittedChars: transcriptLen,
      visualOmittedChars: visualLen,
    },
    changed: true,
  };
}

function compactReadPageOutput(output: unknown): unknown {
  const parsed = parseToolOutput(output);
  if (!parsed || !parsed.parsed || typeof parsed.parsed !== "object") {
    return output;
  }
  if (Array.isArray(parsed.parsed)) return output;
  const record = parsed.parsed as Record<string, unknown>;
  const page = record.page;
  if (!page || typeof page !== "object" || Array.isArray(page)) return output;
  const pageRecord = page as Record<string, unknown>;
  const omitted = omitPageTranscripts(pageRecord);
  let changed = omitted.changed;
  let next: Record<string, unknown> = { ...record, page: omitted.next };
  const continuation = record.continuation;
  if (continuation && typeof continuation === "object" && !Array.isArray(continuation)) {
    const cont = continuation as Record<string, unknown>;
    const contPage = cont.page;
    if (contPage && typeof contPage === "object" && !Array.isArray(contPage)) {
      const contOmitted = omitPageTranscripts(contPage as Record<string, unknown>);
      if (contOmitted.changed) {
        changed = true;
        next = {
          ...next,
          continuation: { ...cont, page: contOmitted.next },
        };
      }
    }
  }
  if (!changed) return output;
  return emitOutput(output, next, parsed.asString);
}

function omitLargeStringArrays(
  record: Record<string, unknown>,
  keys: readonly string[]
): { next: Record<string, unknown>; changed: boolean } {
  let changed = false;
  const next: Record<string, unknown> = { ...record };
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value) || value.length === 0) continue;
    // Only omit when the array looks like a bulky payload (strings/numbers).
    if (
      value.some(
        (item) => typeof item === "string" || typeof item === "number"
      )
    ) {
      next[key] = [];
      next[`${key}Omitted`] = value.length;
      changed = true;
    }
  }
  return { next, changed };
}

function compactWriteColumnOutput(output: unknown): unknown {
  const parsed = parseToolOutput(output);
  if (!parsed || !parsed.parsed || typeof parsed.parsed !== "object") {
    return output;
  }
  if (Array.isArray(parsed.parsed)) return output;
  const record = parsed.parsed as Record<string, unknown>;
  let changed = false;
  let next: Record<string, unknown> = { ...record };

  const columns = record.columns;
  if (Array.isArray(columns) && columns.length > 0) {
    const nextColumns = columns.map((column) => {
      if (!column || typeof column !== "object" || Array.isArray(column)) {
        return column;
      }
      const col = column as Record<string, unknown>;
      const omitted = omitLargeStringArrays(col, [
        "values",
        "dates",
        "cells",
        "writtenValues",
      ]);
      if (omitted.changed) changed = true;
      return omitted.next;
    });
    next = { ...next, columns: nextColumns };
  }

  const top = omitLargeStringArrays(next, ["values", "dates", "cells"]);
  if (top.changed) {
    next = top.next;
    changed = true;
  }
  if (!changed) return output;
  return emitOutput(output, next, parsed.asString);
}

function compactExtractSeriesOutput(output: unknown): unknown {
  const parsed = parseToolOutput(output);
  if (!parsed || !parsed.parsed || typeof parsed.parsed !== "object") {
    return output;
  }
  if (Array.isArray(parsed.parsed)) return output;
  const record = parsed.parsed as Record<string, unknown>;
  const omitted = omitLargeStringArrays(record, ["values", "dates", "rawValues"]);
  if (!omitted.changed) return output;
  return emitOutput(output, omitted.next, parsed.asString);
}

function compactScanAttachmentsOutput(output: unknown): unknown {
  const parsed = parseToolOutput(output);
  if (!parsed || !parsed.parsed || typeof parsed.parsed !== "object") {
    return output;
  }
  if (Array.isArray(parsed.parsed)) return output;
  const record = parsed.parsed as Record<string, unknown>;
  const pages = record.pages;
  if (!Array.isArray(pages) || pages.length === 0) return output;
  let changed = false;
  const nextPages = pages.map((page) => {
    if (!page || typeof page !== "object" || Array.isArray(page)) return page;
    const pageRecord = page as Record<string, unknown>;
    const transcript = pageRecord.transcript;
    const text = pageRecord.text;
    const transcriptLen =
      typeof transcript === "string" ? transcript.length : 0;
    const textLen = typeof text === "string" ? text.length : 0;
    if (transcriptLen === 0 && textLen === 0) return page;
    changed = true;
    return {
      ...pageRecord,
      transcript: transcriptLen > 0 ? "" : transcript,
      text: textLen > 0 ? "" : text,
      transcriptOmittedChars: transcriptLen || undefined,
      textOmittedChars: textLen || undefined,
    };
  });
  if (!changed) return output;
  return emitOutput(output, { ...record, pages: nextPages }, parsed.asString);
}

function compactSearchDocumentsOutput(output: unknown): unknown {
  const parsed = parseToolOutput(output);
  if (!parsed || !parsed.parsed || typeof parsed.parsed !== "object") {
    return output;
  }
  if (Array.isArray(parsed.parsed)) return output;
  const record = parsed.parsed as Record<string, unknown>;
  const results = record.results;
  if (!Array.isArray(results) || results.length === 0) return output;
  let changed = false;
  const nextResults = results.map((hit) => {
    if (!hit || typeof hit !== "object" || Array.isArray(hit)) return hit;
    const row = hit as Record<string, unknown>;
    const excerpt = row.excerpt ?? row.text ?? row.quote;
    if (typeof excerpt !== "string" || excerpt.length === 0) return hit;
    changed = true;
    return {
      filename: row.filename,
      pageNumber: row.pageNumber,
      citation: row.citation,
      attachmentId: row.attachmentId,
      divider: row.divider,
    };
  });
  if (!changed && record.coverageHint == null) return output;
  const next: Record<string, unknown> = {
    ...record,
    results: nextResults,
    excerptsOmitted: true,
  };
  delete next.coverageHint;
  return emitOutput(output, next, parsed.asString);
}

function compactReadPageKeepQuote(output: unknown, quoteChars = 400): unknown {
  const parsed = parseToolOutput(output);
  if (!parsed || !parsed.parsed || typeof parsed.parsed !== "object") {
    return output;
  }
  if (Array.isArray(parsed.parsed)) return output;
  const record = parsed.parsed as Record<string, unknown>;
  const page = record.page;
  if (!page || typeof page !== "object" || Array.isArray(page)) return output;
  const pageRecord = page as Record<string, unknown>;
  const transcript =
    typeof pageRecord.transcript === "string" ? pageRecord.transcript : "";
  const visual =
    typeof pageRecord.visualInterpretation === "string"
      ? pageRecord.visualInterpretation
      : "";
  const continuation = record.continuation;
  const hasContinuationTranscript =
    continuation &&
    typeof continuation === "object" &&
    !Array.isArray(continuation) &&
    typeof (continuation as { page?: { transcript?: unknown } }).page?.transcript ===
      "string" &&
    String((continuation as { page: { transcript: string } }).page.transcript)
      .length > 0;
  if (
    transcript.length <= quoteChars &&
    visual.length === 0 &&
    !hasContinuationTranscript
  ) {
    return output;
  }
  const quote = transcript.slice(0, quoteChars);
  const nextPage = {
    ...pageRecord,
    transcript: quote,
    visualInterpretation: "",
    transcriptOmittedChars: Math.max(0, transcript.length - quote.length),
    visualOmittedChars: visual.length,
  };
  let next: Record<string, unknown> = { ...record, page: nextPage };
  if (continuation && typeof continuation === "object" && !Array.isArray(continuation)) {
    const cont = continuation as Record<string, unknown>;
    const contPage = cont.page;
    if (contPage && typeof contPage === "object" && !Array.isArray(contPage)) {
      const omitted = omitPageTranscripts(contPage as Record<string, unknown>);
      next = { ...next, continuation: { ...cont, page: omitted.next } };
    }
  }
  return emitOutput(output, next, parsed.asString);
}

type CompactToolMode = "history" | "in-turn-stale-search" | "in-turn-stale-page";

function compactToolPart<T extends ToolPartRecord>(
  part: T,
  mode: CompactToolMode = "history"
): T {
  const name = toolNameFromPart(part);
  if (!name || !("output" in part)) return part;

  let nextOutput: unknown = part.output;
  switch (name) {
    case "finish_document_review":
      nextOutput = compactFinishOutput(part.output);
      break;
    case "search_documents":
      if (mode === "in-turn-stale-search") {
        nextOutput = compactSearchDocumentsOutput(part.output);
      } else {
        return part;
      }
      break;
    case "read_document_page":
      nextOutput =
        mode === "in-turn-stale-page"
          ? compactReadPageKeepQuote(part.output)
          : compactReadPageOutput(part.output);
      break;
    case "write_column":
    case "extract_sheet":
      nextOutput = compactWriteColumnOutput(part.output);
      break;
    case "extract_numeric_series":
      nextOutput = compactExtractSeriesOutput(part.output);
      break;
    case "scan_attachments":
      nextOutput = compactScanAttachmentsOutput(part.output);
      break;
    default:
      return part;
  }
  if (nextOutput === part.output) return part;
  return { ...part, output: nextOutput };
}

const KEEP_RECENT_SEARCH_RESULTS = 2;
const KEEP_RECENT_PAGE_READS = 1;

function jsonToolOutputValue(output: unknown): unknown {
  if (
    output &&
    typeof output === "object" &&
    !Array.isArray(output) &&
    "type" in output &&
    (output as { type?: unknown }).type === "json" &&
    "value" in output
  ) {
    return (output as { value: unknown }).value;
  }
  return output;
}

function wrapJsonToolOutput(original: unknown, nextValue: unknown): unknown {
  if (
    original &&
    typeof original === "object" &&
    !Array.isArray(original) &&
    "type" in original &&
    (original as { type?: unknown }).type === "json"
  ) {
    return { ...original, value: nextValue };
  }
  return nextValue;
}

type LocatedToolOutput = {
  name: string;
  getOutput: () => unknown;
  setOutput: (next: unknown) => void;
};

function locateToolOutputs(message: unknown): LocatedToolOutput[] {
  if (!message || typeof message !== "object") return [];
  const rec = message as { parts?: unknown; content?: unknown };
  const found: LocatedToolOutput[] = [];

  const visitPart = (part: unknown) => {
    if (!part || typeof part !== "object") return;
    const row = part as Record<string, unknown>;
    const name = toolNameFromPart(row);
    if (!name || !("output" in row)) return;
    found.push({
      name,
      getOutput: () => row.output,
      setOutput: (next) => {
        row.output = next;
      },
    });
  };

  if (Array.isArray(rec.parts)) {
    for (const part of rec.parts) visitPart(part);
  }

  if (Array.isArray(rec.content)) {
    for (const part of rec.content) {
      if (!part || typeof part !== "object") continue;
      const row = part as Record<string, unknown>;
      const name =
        typeof row.toolName === "string" ? row.toolName : toolNameFromPart(row);
      if (!name) continue;
      if (!("output" in row) && !("result" in row)) continue;
      const key = "output" in row ? "output" : "result";
      found.push({
        name,
        getOutput: () => jsonToolOutputValue(row[key]),
        setOutput: (next) => {
          row[key] = wrapJsonToolOutput(row[key], next);
        },
      });
    }
  }

  return found;
}

/**
 * Same digest rules as persisted history, applied to the current turn's
 * model messages. Recent search_documents / read_document_page stay full so
 * the next draft can still quote them; older ones become citation lists /
 * quoted spans. finish_document_review is always a citation digest.
 */
export function compactInTurnModelMessages<T>(messages: T[]): T[] {
  const searchIndexes: number[] = [];
  const pageIndexes: number[] = [];
  const located = messages.map((message) => locateToolOutputs(message));
  located.forEach((outputs, messageIndex) => {
    for (const output of outputs) {
      if (output.name === "search_documents") searchIndexes.push(messageIndex);
      if (output.name === "read_document_page") pageIndexes.push(messageIndex);
    }
  });
  const keepSearch = new Set(searchIndexes.slice(-KEEP_RECENT_SEARCH_RESULTS));
  const keepPages = new Set(pageIndexes.slice(-KEEP_RECENT_PAGE_READS));

  return messages.map((message, messageIndex) => {
    const outputs = located[messageIndex] ?? [];
    if (outputs.length === 0) return message;
    const clone = structuredClone(message);
    for (const output of locateToolOutputs(clone)) {
      let mode: CompactToolMode | null = null;
      if (output.name === "search_documents") {
        mode = keepSearch.has(messageIndex) ? null : "in-turn-stale-search";
      } else if (output.name === "read_document_page") {
        mode = keepPages.has(messageIndex) ? null : "in-turn-stale-page";
      } else if (output.name === "finish_document_review") {
        mode = "history";
      }
      if (mode == null) continue;
      const compacted = compactToolPart(
        { toolName: output.name, output: output.getOutput() },
        mode
      );
      if (compacted.output !== output.getOutput()) {
        output.setOutput(compacted.output);
      }
    }
    return clone;
  });
}

/** Shrink persisted bulky tool JSON before `convertToModelMessages`. */
export function compactChatToolHistoryForModel(
  messages: UIMessage[]
): UIMessage[] {
  return closeIncompleteChatToolHistory(messages).map((message) => {
    const parts = message.parts;
    if (!parts || parts.length === 0) return message;
    let changed = false;
    const nextParts = parts.map((part) => {
      const compacted = compactToolPart(part as ToolPartRecord);
      if (compacted !== part) changed = true;
      return compacted as typeof part;
    });
    if (!changed) return message;
    return { ...message, parts: nextParts };
  });
}
