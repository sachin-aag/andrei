import type { UIMessage } from "ai";
import {
  coverageKeysMatch,
  documentReviewCoverageKey,
  DocumentReviewSession,
  type DocumentReviewCoverageKey,
  type DocumentReviewCoverageSource,
} from "@/lib/ai/chat/document-review";
import type { RecommendedResultsInventory } from "@/lib/ai/chat/results-inventory";

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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseOutput(output: unknown): Record<string, unknown> | null {
  if (typeof output === "string") {
    const trimmed = output.trim();
    if (!trimmed.startsWith("{")) return null;
    try {
      return asRecord(JSON.parse(trimmed) as unknown);
    } catch {
      return null;
    }
  }
  return asRecord(output);
}

export type PriorFinishedDocumentReview = {
  coverageKey: DocumentReviewCoverageKey;
  recommendedInventory: RecommendedResultsInventory | null;
  totalPages: number | null;
};

function inventoryFromOutput(
  output: Record<string, unknown>
): RecommendedResultsInventory | null {
  const inventory = asRecord(output.recommendedInventory);
  if (!inventory) return null;
  const ids = inventory.ids;
  if (!Array.isArray(ids)) return null;
  const stringIds = ids.filter((id): id is string => typeof id === "string");
  const sourceKind =
    inventory.sourceKind === "verified_table" ||
    inventory.sourceKind === "executed_set" ||
    inventory.sourceKind === "none"
      ? inventory.sourceKind
      : "none";
  const confidence =
    inventory.confidence === "high" ||
    inventory.confidence === "medium" ||
    inventory.confidence === "low"
      ? inventory.confidence
      : "low";
  return {
    ids: stringIds,
    sourceKind,
    confidence,
    citations: [],
  };
}

function coverageKeyFromStartOutput(
  output: Record<string, unknown>
): DocumentReviewCoverageKey | null {
  if (typeof output.coverageKey === "string" && output.coverageKey) {
    return output.coverageKey;
  }

  const attachmentIds = output.attachmentIds;
  if (!Array.isArray(attachmentIds) || attachmentIds.length === 0) {
    return null;
  }
  const pageCountById = new Map<string, number>();
  if (Array.isArray(output.documents)) {
    for (const doc of output.documents) {
      const record = asRecord(doc);
      if (!record) continue;
      const id =
        typeof record.attachmentId === "string" ? record.attachmentId : null;
      const pageCount =
        typeof record.pageCount === "number" ? record.pageCount : null;
      if (id && pageCount != null) pageCountById.set(id, pageCount);
    }
  }
  const sources: DocumentReviewCoverageSource[] = [];
  for (const id of attachmentIds) {
    if (typeof id !== "string" || !id.trim()) continue;
    sources.push({
      attachmentId: id,
      pageCount: pageCountById.get(id) ?? 0,
      ingestRunId: null,
    });
  }
  return sources.length > 0 ? documentReviewCoverageKey(sources) : null;
}

/**
 * Walk prior assistant tool parts and recover the latest finished document
 * review, using the start that opened that review for coverage identity.
 */
export function findPriorFinishedDocumentReview(
  messages: readonly UIMessage[]
): PriorFinishedDocumentReview | null {
  let pendingStartKey: DocumentReviewCoverageKey | null = null;
  let found: PriorFinishedDocumentReview | null = null;

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts ?? []) {
      const name = toolNameFromPart(part as ToolPartRecord);
      const output = parseOutput((part as ToolPartRecord).output);
      if (!output) continue;

      if (name === "start_document_review") {
        pendingStartKey = coverageKeyFromStartOutput(output);
        continue;
      }

      if (name !== "finish_document_review") continue;
      const status = output.status;
      const coverageComplete = output.coverageComplete;
      const finished =
        status === "complete" ||
        coverageComplete === true ||
        (typeof output.reviewedPages === "number" &&
          typeof output.totalPages === "number" &&
          output.reviewedPages === output.totalPages);
      if (!finished) continue;

      const coverageKey =
        (typeof output.coverageKey === "string" && output.coverageKey) ||
        pendingStartKey;
      if (!coverageKey) continue;

      found = {
        coverageKey,
        recommendedInventory: inventoryFromOutput(output),
        totalPages:
          typeof output.totalPages === "number" ? output.totalPages : null,
      };
    }
  }

  return found;
}

export function coverageKeyFromReadyDocuments(
  documents: readonly DocumentReviewCoverageSource[]
): DocumentReviewCoverageKey {
  return documentReviewCoverageKey(documents);
}

/**
 * When the latest finished review still matches live attachment coverage,
 * restore the in-request session so draft gates do not force another walk.
 */
export function rehydrateDocumentReviewIfCoverageUnchanged(input: {
  session: DocumentReviewSession;
  messages: readonly UIMessage[];
  readyDocuments: readonly DocumentReviewCoverageSource[];
}): {
  restored: boolean;
  prior: PriorFinishedDocumentReview | null;
  currentCoverageKey: DocumentReviewCoverageKey;
} {
  const currentCoverageKey = coverageKeyFromReadyDocuments(
    input.readyDocuments
  );
  const prior = findPriorFinishedDocumentReview(input.messages);
  if (!prior || !coverageKeysMatch(prior.coverageKey, currentCoverageKey)) {
    return { restored: false, prior, currentCoverageKey };
  }
  input.session.restoreFromFinishedReview({
    coverageKey: prior.coverageKey,
    recommendedInventory: prior.recommendedInventory,
  });
  return { restored: true, prior, currentCoverageKey };
}

/**
 * Comprehensive page-walks are for coverage growth. If a prior finish already
 * covers the current ready attachments, keep adaptive retrieval instead of
 * forcing another start_document_review.
 */
export function retrievalPolicyAfterCoverageDelta(input: {
  policy: "focused" | "adaptive" | "comprehensive";
  coverageUnchanged: boolean;
}): "focused" | "adaptive" | "comprehensive" {
  if (input.policy === "comprehensive" && input.coverageUnchanged) {
    return "adaptive";
  }
  return input.policy;
}
