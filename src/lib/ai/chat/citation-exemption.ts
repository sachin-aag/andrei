/**
 * Attachment citation grounding is fact-level, never section-level.
 * Tables stay strict. All other writes use frame: title-page / user /
 * 1 April–31 March bounds and facts already in this report are exempt; copied
 * attachment facts still need a page quote.
 */

import type { DocumentType, SectionType } from "@/db/schema";
import { evidenceContainsFact } from "@/lib/ai/chat/evidence-match";
import type { HardFact } from "@/lib/ai/chat/claim-facts";
import { contextForPrompt } from "@/lib/ai/section-context";
import { allIdentityMetadataKeys } from "@/lib/ai/chat/identity";
import { elrChatContextIdentity } from "@/lib/document-types/elr/chat-identity";
import {
  canonicalElrPeriod,
  elrFinancialYearWindow,
  parseElrIdentityDate,
  type ElrFinancialYearWindow,
} from "@/lib/document-types/elr/financial-year";

export type CitationGroundingMode = "strict" | "skip" | "frame";

export type CitationWriteTool =
  | "draft_field"
  | "propose_edit"
  | "edit_table"
  | "draft_identity";

export type GroundDraftGrounding = {
  mode?: CitationGroundingMode;
  reportMetadata?: Record<string, unknown> | null;
  latestUserMessageText?: string;
  /** Sibling fields + other sections (not the field being written). */
  alreadyStatedText?: string;
};

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_YEAR_RE =
  /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/gi;

const LEGACY_ELR_IDENTITY_META_KEYS = [
  "equipmentId",
  "equipmentName",
  "formatScope",
  "periodFrom",
  "periodTo",
  "lastPrqDate",
  "lastPrqNo",
] as const;

export function citationGroundingMode(input: {
  documentType: DocumentType;
  section: string;
  targetField: string;
  tool?: CitationWriteTool;
}): CitationGroundingMode {
  const tableWrite =
    input.tool === "edit_table" || input.targetField.trim() === "table";
  return tableWrite ? "strict" : "frame";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function contentWithoutField(
  content: Record<string, unknown>,
  targetField: string
): Record<string, unknown> {
  const path = targetField
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  if (path.length === 0) return { ...content };
  const next: Record<string, unknown> = { ...content };
  const [head, ...rest] = path;
  if (!head) return next;
  if (rest.length === 0) {
    delete next[head];
    return next;
  }
  const child = next[head];
  if (isRecord(child)) {
    next[head] = contentWithoutField(child, rest.join("."));
  }
  return next;
}

/** Flatten other fields/sections so recaps of this document are exempt. */
export function alreadyStatedHaystack(input: {
  sections?: Partial<Record<string, unknown>> | null;
  exclude?: { section: string; targetField: string };
  extra?: Array<string | undefined | null>;
}): string {
  const parts: string[] = [];
  if (input.sections) {
    for (const [section, content] of Object.entries(input.sections)) {
      if (!isRecord(content)) continue;
      const trimmed =
        input.exclude?.section === section
          ? contentWithoutField(content, input.exclude.targetField)
          : content;
      const text = contextForPrompt(section as SectionType, trimmed).trim();
      if (text) parts.push(text);
    }
  }
  for (const extra of input.extra ?? []) {
    const text = extra?.trim();
    if (text) parts.push(text);
  }
  return parts.join("\n");
}

export function citationGroundingRunsRepair(
  mode: CitationGroundingMode
): boolean {
  switch (mode) {
    case "skip":
      return false;
    case "frame":
    case "strict":
      return true;
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

function metaString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
): string {
  if (!metadata || typeof metadata !== "object") return "";
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function parseMonthYear(
  raw: string
): { year: number; month: number } | null {
  const match =
    /^(?:(\d{1,2})\s+)?([A-Za-z]{3,9})\s+(\d{4})$/.exec(raw.trim());
  if (!match) return null;
  const month = MONTH_INDEX[match[2]!.toLowerCase()];
  const year = Number(match[3]);
  if (!month || !year) return null;
  return { year, month };
}

function monthYearsFromText(text: string): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  MONTH_YEAR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MONTH_YEAR_RE.exec(text))) {
    const month = MONTH_INDEX[match[1]!.toLowerCase()];
    const year = Number(match[2]);
    if (month && year) out.push({ year, month });
  }
  return out;
}

function fyWindowFromUserText(text: string): ElrFinancialYearWindow | null {
  const months = monthYearsFromText(text);
  const aprils = months.filter((row) => row.month === 4);
  const marches = months.filter((row) => row.month === 3);
  for (const april of aprils) {
    if (marches.some((march) => march.year === april.year + 1)) {
      return elrFinancialYearWindow(april.year);
    }
  }
  return null;
}

function fyWindowsFromSources(input: {
  reportMetadata?: Record<string, unknown> | null;
  latestUserMessageText?: string;
}): ElrFinancialYearWindow[] {
  const windows: ElrFinancialYearWindow[] = [];
  const seen = new Set<number>();
  const push = (window: ElrFinancialYearWindow | null) => {
    if (!window || seen.has(window.startYear)) return;
    seen.add(window.startYear);
    windows.push(window);
  };
  const metadata = input.reportMetadata;
  push(
    canonicalElrPeriod({
      periodFrom: metaString(metadata, "periodFrom"),
      periodTo: metaString(metadata, "periodTo"),
      lastPrqDate: metaString(metadata, "lastPrqDate"),
      lastPrqNo: metaString(metadata, "lastPrqNo"),
    })
  );
  push(fyWindowFromUserText(input.latestUserMessageText ?? ""));
  return windows;
}

function isCanonicalFyBoundFact(
  fact: HardFact,
  window: ElrFinancialYearWindow
): boolean {
  if (fact.kind !== "date") return false;
  const parsed = parseElrIdentityDate(fact.text);
  if (parsed) {
    return (
      (parsed.day === 1 &&
        parsed.month === 4 &&
        parsed.year === window.startYear) ||
      (parsed.day === 31 &&
        parsed.month === 3 &&
        parsed.year === window.startYear + 1)
    );
  }
  const monthYear = parseMonthYear(fact.text);
  if (!monthYear) return false;
  return (
    (monthYear.month === 4 && monthYear.year === window.startYear) ||
    (monthYear.month === 3 && monthYear.year === window.startYear + 1)
  );
}

function identityHaystacks(input: {
  reportMetadata?: Record<string, unknown> | null;
  latestUserMessageText?: string;
  alreadyStatedText?: string;
}): string[] {
  const haystacks: string[] = [];
  const user = input.latestUserMessageText?.trim();
  if (user) haystacks.push(user);
  const alreadyStated = input.alreadyStatedText?.trim();
  if (alreadyStated) haystacks.push(alreadyStated);
  const metadata = input.reportMetadata;
  if (metadata && typeof metadata === "object") {
    haystacks.push(...elrChatContextIdentity(metadata));
    for (const key of [
      ...LEGACY_ELR_IDENTITY_META_KEYS,
      ...allIdentityMetadataKeys(),
    ]) {
      const value = metaString(metadata, key).trim();
      if (value) haystacks.push(value);
    }
  }
  for (const window of fyWindowsFromSources(input)) {
    haystacks.push(
      window.fromLabel,
      window.toLabel,
      `01 April ${window.startYear}`,
      `1 April ${window.startYear}`,
      `31 March ${window.startYear + 1}`,
      `April ${window.startYear}`,
      `March ${window.startYear + 1}`
    );
  }
  return haystacks;
}

/** Title-page identity, user-confirmed facts, 1 April–31 March bounds, already-stated. */
export function isExemptFrameFact(
  fact: HardFact,
  source: {
    reportMetadata?: Record<string, unknown> | null;
    latestUserMessageText?: string;
    alreadyStatedText?: string;
  }
): boolean {
  for (const window of fyWindowsFromSources(source)) {
    if (isCanonicalFyBoundFact(fact, window)) return true;
  }
  return identityHaystacks(source).some((haystack) =>
    evidenceContainsFact(haystack, fact)
  );
}
