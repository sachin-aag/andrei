import {
  buildIdentityUpdate,
  chatIdentityFields,
  CHAT_IDENTITY_SECTION,
  identityRemainingRequired,
  isChatIdentitySection,
  readIdentityValue,
  type ChatIdentityReport,
  type IdentityFieldPatch,
} from "@/lib/ai/chat/identity";
import type { DocumentType } from "@/db/schema";
import type { CommentRecord } from "@/types/report";

export type IdentityOperation = {
  fields: IdentityFieldPatch[];
};

export type IdentityValueMap = Record<string, string>;

export function parseIdentityOperation(raw: unknown): IdentityOperation | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const rec = raw as Record<string, unknown>;
  if (!Array.isArray(rec.fields)) return undefined;
  const fields: IdentityFieldPatch[] = rec.fields.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const field = item as Record<string, unknown>;
    if (typeof field.key !== "string" || typeof field.value !== "string") {
      return [];
    }
    const key = field.key.trim();
    if (!key) return [];
    return [{ key, value: field.value }];
  });
  return fields.length > 0 ? { fields } : undefined;
}

function isAiSuggestionKind(kind: string): boolean {
  return kind === "ai_fix" || kind === "ai_redraft";
}

export function isIdentitySuggestion(comment: CommentRecord): boolean {
  return (
    isChatIdentitySection(comment.section ?? "") &&
    isAiSuggestionKind(comment.kind) &&
    parseIdentityOperation(
      (() => {
        try {
          return JSON.parse(comment.content) as { identityOperation?: unknown };
        } catch {
          return {};
        }
      })().identityOperation
    ) != null
  );
}

export function openIdentitySuggestion(
  comments: readonly CommentRecord[]
): CommentRecord | null {
  return (
    comments.find(
      (comment) =>
        !comment.parentId &&
        comment.status === "open" &&
        isChatIdentitySection(comment.section ?? "") &&
        isAiSuggestionKind(comment.kind)
    ) ?? null
  );
}

export function identitySnapshotMap(
  documentType: DocumentType,
  report: ChatIdentityReport
): IdentityValueMap {
  const map: IdentityValueMap = {};
  for (const field of chatIdentityFields(documentType)) {
    map[field.key] = readIdentityValue(field, report);
  }
  return map;
}

export function identitySuggestionInsertText(
  documentType: DocumentType,
  operation: IdentityOperation
): string {
  const byKey = new Map(
    chatIdentityFields(documentType).map((field) => [field.key, field.label])
  );
  return operation.fields
    .map((field) => {
      const label = byKey.get(field.key) ?? field.key;
      return `${label}: ${field.value}`;
    })
    .join("; ");
}

export type FoldableIdentityPayload = {
  identityOperation?: IdentityOperation;
  suggestionBase?: unknown;
  suggestionIntent?: unknown;
  insertText: string;
  reasoning: string;
};

export function foldIdentityPayload<T extends FoldableIdentityPayload>(
  existing: T,
  next: T
): T {
  const existingOp = existing.identityOperation;
  const nextOp = next.identityOperation;
  if (!existingOp || !nextOp) return next;
  const byKey = new Map(existingOp.fields.map((field) => [field.key, field]));
  for (const field of nextOp.fields) {
    byKey.set(field.key, field);
  }
  const fields = [...byKey.values()];
  // Keep the first snapshot for keys already on the card; add base only for
  // newly proposed keys so Apply still three-way-merges against live edits.
  const suggestionBase: IdentityValueMap = {
    ...(asValueMap(next.suggestionBase) ?? {}),
    ...(asValueMap(existing.suggestionBase) ?? {}),
  };
  const suggestionIntent: IdentityValueMap = {
    ...(asValueMap(existing.suggestionIntent) ?? {}),
    ...(asValueMap(next.suggestionIntent) ?? {}),
  };
  return {
    ...existing,
    ...next,
    identityOperation: { fields },
    suggestionBase,
    suggestionIntent,
    insertText: next.insertText || existing.insertText,
    reasoning: next.reasoning || existing.reasoning,
  };
}

function asValueMap(raw: unknown): IdentityValueMap | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const map: IdentityValueMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") map[key] = value;
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

export function identityIntentFromPayload(payload: {
  identityOperation?: IdentityOperation;
  suggestionIntent?: unknown;
}): IdentityValueMap {
  const fromIntent = asValueMap(payload.suggestionIntent);
  if (fromIntent) return fromIntent;
  const map: IdentityValueMap = {};
  for (const field of payload.identityOperation?.fields ?? []) {
    map[field.key] = field.value;
  }
  return map;
}

export function identityBaseFromPayload(payload: {
  suggestionBase?: unknown;
}): IdentityValueMap {
  return asValueMap(payload.suggestionBase) ?? {};
}

export function reportAfterIdentityIntent(
  documentType: DocumentType,
  current: ChatIdentityReport,
  intent: IdentityValueMap
): ChatIdentityReport {
  const fields = Object.entries(intent).map(([key, value]) => ({ key, value }));
  const update = buildIdentityUpdate({ documentType, current, fields });
  if (!update.ok) return current;
  return {
    documentNo: update.documentNo ?? current.documentNo,
    date: update.date ?? current.date,
    metadata: (update.metadata ?? current.metadata) as Record<
      string,
      unknown
    > | null,
  };
}

export function remainingRequiredAfterIdentityIntent(
  documentType: DocumentType,
  current: ChatIdentityReport,
  intent: IdentityValueMap
): string[] {
  return identityRemainingRequired(
    documentType,
    reportAfterIdentityIntent(documentType, current, intent)
  );
}

export type IdentityMergeResult =
  | { status: "already_present" }
  | {
      status: "applied" | "conflict";
      documentNo?: string;
      date?: Date;
      metadata?: Record<string, unknown>;
      applied: string[];
      skipped: Array<{ key: string; reason: "conflict" | "already_present" }>;
    };

/**
 * Per-field three-way merge for one header card. Compatible fields apply;
 * conflicts keep the live value. Duplicate document numbers are checked by
 * the caller at propose and at Apply.
 */
export function mergeIdentitySuggestion(input: {
  documentType: DocumentType;
  live: ChatIdentityReport;
  base: IdentityValueMap;
  intent: IdentityValueMap;
}): IdentityMergeResult {
  const catalog = chatIdentityFields(input.documentType);
  if (catalog.length === 0) return { status: "already_present" };
  const liveMap = identitySnapshotMap(input.documentType, input.live);
  const patches: IdentityFieldPatch[] = [];
  const skipped: Array<{ key: string; reason: "conflict" | "already_present" }> =
    [];
  let conflict = false;

  for (const field of catalog) {
    if (!(field.key in input.intent)) continue;
    const intent = input.intent[field.key] ?? "";
    const live = liveMap[field.key] ?? "";
    const base = input.base[field.key] ?? "";
    if (live === intent) {
      skipped.push({ key: field.key, reason: "already_present" });
      continue;
    }
    if (live === base || live === "") {
      patches.push({ key: field.key, value: intent });
      continue;
    }
    conflict = true;
    skipped.push({ key: field.key, reason: "conflict" });
  }

  if (patches.length === 0) return { status: "already_present" };

  const update = buildIdentityUpdate({
    documentType: input.documentType,
    current: input.live,
    fields: patches,
  });
  if (!update.ok) return { status: "already_present" };
  return {
    status: conflict ? "conflict" : "applied",
    ...(update.documentNo !== undefined ? { documentNo: update.documentNo } : {}),
    ...(update.date !== undefined ? { date: update.date } : {}),
    ...(update.metadata !== undefined ? { metadata: update.metadata } : {}),
    applied: update.applied,
    skipped,
  };
}

export function identityCurrentFromReport(report: {
  documentNo: string;
  date: string | Date;
  metadata?: Record<string, unknown> | null;
}): ChatIdentityReport {
  return {
    documentNo: report.documentNo,
    date: report.date,
    metadata: report.metadata ?? null,
  };
}

export function applyIdentityPatchToReport<
  T extends {
    documentNo: string;
    date: string;
    metadata: unknown;
  },
>(
  report: T,
  patch: {
    documentNo?: string;
    date?: string;
    metadata?: Record<string, unknown>;
  }
): T {
  return {
    ...report,
    ...(patch.documentNo !== undefined ? { documentNo: patch.documentNo } : {}),
    ...(patch.date !== undefined ? { date: patch.date } : {}),
    ...(patch.metadata !== undefined
      ? { metadata: patch.metadata as T["metadata"] }
      : {}),
  };
}

export function proposedIdentityValue(
  comments: readonly CommentRecord[],
  fieldKey: string
): string | undefined {
  const open = openIdentitySuggestion(comments);
  if (!open) return undefined;
  try {
    const parsed = JSON.parse(open.content) as {
      identityOperation?: unknown;
      suggestionIntent?: unknown;
    };
    const intent = identityIntentFromPayload({
      identityOperation: parseIdentityOperation(parsed.identityOperation),
      suggestionIntent: parsed.suggestionIntent,
    });
    if (fieldKey in intent) return intent[fieldKey];
  } catch {
    return undefined;
  }
  return undefined;
}

export { CHAT_IDENTITY_SECTION };
