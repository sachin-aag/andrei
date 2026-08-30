import type { UIMessage } from "ai";

/**
 * Prior `finish_document_review` rows can be hundreds of KB (every page
 * finding). Re-sending that on the next turn blows the model request and
 * the assistant appears to "hit an error" with no new Langfuse generation.
 * Keep inventory/ids; drop the findings sample from history.
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

function compactFinishOutput(output: unknown): unknown {
  if (output == null) return output;
  let parsed: unknown = output;
  if (typeof output === "string") {
    const trimmed = output.trim();
    if (!trimmed.startsWith("{")) return output;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return output;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return output;
  }
  const record = parsed as Record<string, unknown>;
  const findings = record.findings;
  if (!Array.isArray(findings) || findings.length === 0) return output;
  const next = {
    ...record,
    findings: [],
    findingsOmitted: findings.length,
  };
  return typeof output === "string" ? JSON.stringify(next) : next;
}

function compactToolPart<T extends ToolPartRecord>(part: T): T {
  if (toolNameFromPart(part) !== "finish_document_review") return part;
  if (!("output" in part)) return part;
  const nextOutput = compactFinishOutput(part.output);
  if (nextOutput === part.output) return part;
  return { ...part, output: nextOutput };
}

/** Shrink persisted document-review tool JSON before `convertToModelMessages`. */
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
