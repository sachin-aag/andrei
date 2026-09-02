import type { UIMessage } from "ai";

/**
 * Prior tool rows can be hundreds of KB (page transcripts, finish findings,
 * worksheet write payloads). Re-sending that on the next turn blows the model
 * request and the assistant appears to "hit an error" with no new Langfuse
 * generation. Keep ids / counts / citations; drop bulky text and value arrays.
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

function compactFinishOutput(output: unknown): unknown {
  const parsed = parseToolOutput(output);
  if (!parsed || !parsed.parsed || typeof parsed.parsed !== "object") {
    return output;
  }
  if (Array.isArray(parsed.parsed)) return output;
  const record = parsed.parsed as Record<string, unknown>;
  const findings = record.findings;
  if (!Array.isArray(findings) || findings.length === 0) return output;
  const next = {
    ...record,
    findings: [],
    findingsOmitted: findings.length,
  };
  return emitOutput(output, next, parsed.asString);
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
  const transcript = pageRecord.transcript;
  const visual = pageRecord.visualInterpretation;
  const transcriptLen =
    typeof transcript === "string" ? transcript.length : 0;
  const visualLen = typeof visual === "string" ? visual.length : 0;
  if (transcriptLen === 0 && visualLen === 0) return output;
  const nextPage = {
    ...pageRecord,
    transcript: "",
    visualInterpretation: "",
    transcriptOmittedChars: transcriptLen,
    visualOmittedChars: visualLen,
  };
  const next = { ...record, page: nextPage };
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

function compactToolPart<T extends ToolPartRecord>(part: T): T {
  const name = toolNameFromPart(part);
  if (!name || !("output" in part)) return part;

  let nextOutput: unknown = part.output;
  switch (name) {
    case "finish_document_review":
      nextOutput = compactFinishOutput(part.output);
      break;
    case "read_document_page":
      nextOutput = compactReadPageOutput(part.output);
      break;
    case "write_column":
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

/** Shrink persisted bulky tool JSON before `convertToModelMessages`. */
export function compactChatToolHistoryForModel(
  messages: UIMessage[]
): UIMessage[] {
  return messages.map((message) => {
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
