import { documentTypeEnum, type DocumentType } from "@/db/schema";
import { getDocumentType } from "@/lib/document-types";
import type { ChatIdentityField } from "@/lib/document-types/types";
import { isCreatePreloadDocumentNo } from "@/lib/reports/create-preload";

/** Synthetic section key — not a `report_sections` row and not in TOC. */
export const CHAT_IDENTITY_SECTION = "identity";

export const IDENTITY_UNSET_NOTE =
  "(unset) — search attachments and call draft_identity";

const DEFAULT_IDENTITY_LABEL = "Cover identity";

const IDENTITY_VALUE_MAX = 200;

export type ChatIdentityReport = {
  documentNo: string;
  date: Date | string;
  metadata?: Record<string, unknown> | null;
};

export function isChatIdentitySection(value: string): boolean {
  return value === CHAT_IDENTITY_SECTION;
}

export function chatIdentityFields(
  documentType: DocumentType
): readonly ChatIdentityField[] {
  return getDocumentType(documentType).chat.identityFields ?? [];
}

export function hasChatIdentity(documentType: DocumentType): boolean {
  return chatIdentityFields(documentType).length > 0;
}

export function chatIdentityLabel(documentType: DocumentType): string {
  return (
    getDocumentType(documentType).chat.identityLabel?.trim() ||
    DEFAULT_IDENTITY_LABEL
  );
}

function metaString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
): string {
  if (!metadata || typeof metadata !== "object") return "";
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function dateToIsoDay(value: Date | string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString().slice(0, 10);
  }
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toISOString().slice(0, 10);
}

export function identityMetadataKey(field: ChatIdentityField): string {
  return field.metadataKey?.trim() || field.key;
}

export function readIdentityValue(
  field: ChatIdentityField,
  report: ChatIdentityReport
): string {
  if (field.storage === "documentNo") {
    const documentNo = report.documentNo.trim();
    if (!documentNo || isCreatePreloadDocumentNo(documentNo)) return "";
    return documentNo;
  }
  if (field.storage === "date") {
    if (field.alsoMetadataKey) {
      const fromMeta = metaString(report.metadata, field.alsoMetadataKey);
      if (fromMeta) return fromMeta;
      return "";
    }
    return dateToIsoDay(report.date);
  }
  return metaString(report.metadata, identityMetadataKey(field));
}

export function identityRemainingRequired(
  documentType: DocumentType,
  report: ChatIdentityReport
): string[] {
  return chatIdentityFields(documentType)
    .filter((field) => field.required && !readIdentityValue(field, report))
    .map((field) => field.key);
}

export function identityNeedsDraft(
  documentType: DocumentType,
  report: ChatIdentityReport | null | undefined
): boolean {
  if (!report) return false;
  return identityRemainingRequired(documentType, report).length > 0;
}

/** Metadata keys the citation frame exemption treats as already-set title-page identity. */
export function allIdentityMetadataKeys(): string[] {
  const keys = new Set<string>();
  for (const type of documentTypeEnum.enumValues) {
    for (const field of chatIdentityFields(type)) {
      if (field.storage === "metadata") keys.add(identityMetadataKey(field));
      if (field.alsoMetadataKey) keys.add(field.alsoMetadataKey);
    }
  }
  return [...keys];
}

export function sanitizeIdentityScalar(value: string): string {
  return value
    .replace(/(?:^|\n)\s*Citations:\s*[\s\S]*$/i, " ")
    .replace(/\[[^\]]+]/g, " ")
    .replace(/<[^>\n]{1,80}>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, IDENTITY_VALUE_MAX);
}

const BARE_CAPACITY_NUMBER_RE = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;

/** Longer tokens first so "litres" is not captured as "L" + "itres". */
const CAPACITY_UNIT_TOKEN = String.raw`KL|kL|kl|m³|m3|mL|ml|litres?|liters?|L|l|kg`;

const NUMBER_WITH_CAPACITY_UNIT_RE = new RegExp(
  String.raw`(?<![A-Za-z0-9.])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![\d.])\s*(${CAPACITY_UNIT_TOKEN})\b`,
  "gi"
);

const IDENTITY_HAS_CAPACITY_UNIT_RE = new RegExp(
  String.raw`\d(?:\.\d+)?\s*(?:${CAPACITY_UNIT_TOKEN})\s*$`,
  "i"
);

function canonicalCapacityUnit(unit: string): string {
  const lower = unit.trim().toLowerCase();
  if (lower === "kl") return "kl";
  if (lower === "ml") return "ml";
  if (lower === "m3" || unit.trim() === "m³") return "m3";
  if (lower === "kg") return "kg";
  if (lower === "l" || /^litres?$/.test(lower) || /^liters?$/.test(lower)) {
    return "l";
  }
  return lower;
}

function parseCapacityNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * When Capacity / Size is a bare number, copy the unit printed next to that
 * same figure on a cited page (`8000` + `Capacity 8000 L` → `8000 L`).
 * Unique labeled Capacity/Size wins; conflicting units stay bare; 8000 is
 * not converted to 8 KL.
 */
export function attachIdentityCapacityUnits(
  value: string,
  quotes: readonly string[]
): string {
  const trimmed = value.trim();
  if (!trimmed || IDENTITY_HAS_CAPACITY_UNIT_RE.test(trimmed)) return trimmed;
  if (!BARE_CAPACITY_NUMBER_RE.test(trimmed)) return trimmed;
  const want = parseCapacityNumber(trimmed);
  if (want === null) return trimmed;

  const labeled = new Map<string, string>();
  const unlabeled = new Map<string, string>();
  for (const quote of quotes) {
    if (!quote.trim()) continue;
    const re = new RegExp(NUMBER_WITH_CAPACITY_UNIT_RE.source, "gi");
    let match: RegExpExecArray | null;
    while ((match = re.exec(quote)) !== null) {
      const rawNumber = match[1] ?? "";
      const unit = match[2] ?? "";
      if (!unit || parseCapacityNumber(rawNumber) !== want) continue;
      const canonical = canonicalCapacityUnit(unit);
      const lineStart = quote.lastIndexOf("\n", match.index);
      const prefix = quote.slice(lineStart + 1, match.index);
      const isLabeled = /capacity/i.test(prefix.slice(-80));
      const target = isLabeled ? labeled : unlabeled;
      if (!target.has(canonical)) target.set(canonical, unit);
    }
  }

  const pick = (found: Map<string, string>): string | null => {
    if (found.size !== 1) return null;
    const unit = found.values().next().value;
    return typeof unit === "string" ? unit : null;
  };
  const unit = pick(labeled) ?? (labeled.size > 0 ? null : pick(unlabeled));
  if (!unit) return trimmed;
  return `${trimmed} ${unit}`.slice(0, IDENTITY_VALUE_MAX);
}

export function parseIdentityDate(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

export type IdentityFieldPatch = {
  key: string;
  value: string;
};

export type IdentityUpdateOk = {
  ok: true;
  documentNo?: string;
  date?: Date;
  metadata?: Record<string, unknown>;
  applied: string[];
  skipped: Array<{ key: string; reason: string }>;
};

export type IdentityUpdateError = {
  ok: false;
  status: "invalid_fields" | "unknown_key" | "invalid_value";
  message: string;
  allowedKeys?: string[];
};

/**
 * Pure patch from `draft_identity` fields. Does not check document-number
 * uniqueness — the tool does that before writing.
 */
export function buildIdentityUpdate(input: {
  documentType: DocumentType;
  current: ChatIdentityReport;
  fields: readonly IdentityFieldPatch[];
}): IdentityUpdateOk | IdentityUpdateError {
  const catalog = chatIdentityFields(input.documentType);
  if (catalog.length === 0) {
    return {
      ok: false,
      status: "invalid_fields",
      message: "This document type has no cover/header identity fields.",
    };
  }
  const byKey = new Map(catalog.map((field) => [field.key, field]));
  const allowedKeys = catalog.map((field) => field.key);
  if (input.fields.length === 0) {
    return {
      ok: false,
      status: "invalid_fields",
      message: "Pass at least one identity field to fill.",
      allowedKeys,
    };
  }

  let documentNo: string | undefined;
  let date: Date | undefined;
  const metadata: Record<string, unknown> = {
    ...(input.current.metadata && typeof input.current.metadata === "object"
      ? input.current.metadata
      : {}),
  };
  let metadataChanged = false;
  const applied: string[] = [];
  const skipped: Array<{ key: string; reason: string }> = [];

  for (const patch of input.fields) {
    const key = patch.key.trim();
    const field = byKey.get(key);
    if (!field) {
      return {
        ok: false,
        status: "unknown_key",
        message: `'${key}' is not an identity field for this document.`,
        allowedKeys,
      };
    }
    const cleaned = sanitizeIdentityScalar(patch.value);
    if (!cleaned) {
      skipped.push({ key, reason: "empty" });
      continue;
    }
    if (field.storage === "documentNo") {
      if (isCreatePreloadDocumentNo(cleaned)) {
        return {
          ok: false,
          status: "invalid_value",
          message: "That document number is reserved.",
        };
      }
      documentNo = cleaned;
      if (field.alsoMetadataKey) {
        metadata[field.alsoMetadataKey] = cleaned;
        metadataChanged = true;
      }
      applied.push(key);
      continue;
    }
    if (field.storage === "date") {
      const isoDay = parseIdentityDate(cleaned);
      if (!isoDay) {
        return {
          ok: false,
          status: "invalid_value",
          message: `'${field.label}' must be a calendar date (YYYY-MM-DD).`,
        };
      }
      date = new Date(`${isoDay}T00:00:00.000Z`);
      if (field.alsoMetadataKey) {
        metadata[field.alsoMetadataKey] = isoDay;
        metadataChanged = true;
      }
      applied.push(key);
      continue;
    }
    metadata[identityMetadataKey(field)] = cleaned;
    if (field.alsoMetadataKey) metadata[field.alsoMetadataKey] = cleaned;
    metadataChanged = true;
    applied.push(key);
  }

  if (applied.length === 0) {
    return {
      ok: false,
      status: "invalid_fields",
      message: "No identity values to write after cleaning empty fields.",
      allowedKeys,
    };
  }

  return {
    ok: true,
    ...(documentNo !== undefined ? { documentNo } : {}),
    ...(date !== undefined ? { date } : {}),
    ...(metadataChanged ? { metadata } : {}),
    applied,
    skipped,
  };
}

export function identityGroundingText(
  documentType: DocumentType,
  fields: readonly IdentityFieldPatch[]
): string {
  const byKey = new Map(
    chatIdentityFields(documentType).map((field) => [field.key, field])
  );
  return fields
    .map((patch) => {
      const field = byKey.get(patch.key.trim());
      const label = field?.label ?? patch.key;
      return `${label}: ${patch.value.trim()}`;
    })
    .filter((line) => line.replace(/^[^:]+:\s*/, "").length > 0)
    .join("\n");
}

export function identitySnapshotFields(
  documentType: DocumentType,
  report: ChatIdentityReport
): Array<{
  targetField: string;
  kind: "plain";
  charCount: number;
  isEmpty: boolean;
  fillState: "empty" | "filled";
  text: string;
  readingText: string;
  imageCount: 0;
}> {
  return chatIdentityFields(documentType).map((field) => {
    const text = readIdentityValue(field, report);
    const isEmpty = text.length === 0;
    return {
      targetField: field.key,
      kind: "plain" as const,
      charCount: text.length,
      isEmpty,
      fillState: isEmpty ? ("empty" as const) : ("filled" as const),
      text,
      readingText: text,
      imageCount: 0 as const,
    };
  });
}
