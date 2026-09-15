import type { SectionType } from "@/db/schema";
import type { MatrixColumnSchema } from "@/lib/document-types/design-verification/matrix-columns";
import {
  ACCESS_CONTROL_COLUMN_SCHEMA,
  ALARM_COLUMN_SCHEMA,
  AUDIT_TRAIL_COLUMN_SCHEMA,
  BREAKDOWN_COLUMN_SCHEMA,
  CALIBRATION_COLUMN_SCHEMA,
  CSV_STATUS_COLUMN_SCHEMA,
  MONITORING_COLUMN_SCHEMA,
  PREVENTIVE_MAINTENANCE_COLUMN_SCHEMA,
  QMS_COLUMN_SCHEMA,
  QUALIFICATION_COLUMN_SCHEMA,
} from "@/lib/document-types/elr/matrix-columns";

/**
 * Live ELR inventory tables whose evidence is compiled across files.
 * Media Fill is not in this map — it uses a stemming phrase family.
 */
const ELR_INVENTORY_SCHEMAS: Partial<
  Record<SectionType, readonly MatrixColumnSchema<string>[]>
> = {
  elr_qualification: QUALIFICATION_COLUMN_SCHEMA,
  elr_monitoring: MONITORING_COLUMN_SCHEMA,
  elr_calibration: CALIBRATION_COLUMN_SCHEMA,
  elr_preventive_maintenance: PREVENTIVE_MAINTENANCE_COLUMN_SCHEMA,
  elr_breakdowns: BREAKDOWN_COLUMN_SCHEMA,
  elr_qms: QMS_COLUMN_SCHEMA,
  elr_alarms: ALARM_COLUMN_SCHEMA,
  elr_access_control: ACCESS_CONTROL_COLUMN_SCHEMA,
  elr_audit_trail: AUDIT_TRAIL_COLUMN_SCHEMA,
  elr_csv_status: CSV_STATUS_COLUMN_SCHEMA,
};

const GENERIC_COLUMN_NEEDLES = new Set([
  "serial",
  "sr no",
  "s no",
  "sl no",
  "date",
  "result",
  "status",
  "remarks",
  "remark",
  "notes",
  "description",
  "summary",
  "parameter",
  "period",
  "format",
  "activity",
  "stage",
  "tag",
  "outcome",
  "frequency",
  "code",
  "count",
  "impact",
  "category",
  "action",
  "system",
  "user",
  "role",
  "alarm",
  "instrument",
  "failure",
  "deviation",
]);

/**
 * URS / PQP language that pairs with a section noun without being a
 * recorded result (`monitoring systems`, `qualification protocol`).
 */
const GENERIC_SECTION_NOUN_OTHER = new Set([
  "system",
  "systems",
  "equipment",
  "connection",
  "connections",
  "port",
  "ports",
  "capability",
  "procedure",
  "procedures",
  "requirement",
  "requirements",
  "philosophy",
  "plan",
  "plans",
  "protocol",
  "protocols",
  "report",
  "reports",
  "performance",
  "periodic",
  "installation",
  "operational",
  "process",
  "machine",
  "following",
  "section",
  "data",
  "table",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "onto",
  "over",
  "under",
]);

const DATE_RE = /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/;

type InventoryPageInput = {
  filename?: string | null;
  transcript?: string | null;
  pageContext?: string | null;
  outlineTitle?: string | null;
};

function normalizeNeedle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[./]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDistinctiveNeedle(needle: string): boolean {
  if (!needle || GENERIC_COLUMN_NEEDLES.has(needle)) return false;
  if (needle.includes(" ")) return needle.length >= 8;
  return needle.length >= 8;
}

function needlesForColumn(col: MatrixColumnSchema<string>): string[] {
  if (col.id === "serial") return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [col.label, ...col.aliases]) {
    const needle = normalizeNeedle(raw);
    if (!isDistinctiveNeedle(needle) || seen.has(needle)) continue;
    seen.add(needle);
    out.push(needle);
  }
  return out;
}

export function inventoryColumnNeedles(
  section: SectionType
): readonly string[] {
  const schema = ELR_INVENTORY_SCHEMAS[section];
  if (!schema) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const col of schema) {
    for (const needle of needlesForColumn(col)) {
      if (seen.has(needle)) continue;
      seen.add(needle);
      out.push(needle);
    }
  }
  return out;
}

export function inventoryPhraseFamilyForSection(
  section: string | null | undefined
): readonly string[] {
  if (!section || section === "all") return [];
  return inventoryColumnNeedles(section as SectionType);
}

function inventorySections(): SectionType[] {
  return Object.keys(ELR_INVENTORY_SCHEMAS) as SectionType[];
}

export function inventorySectionForObjective(
  objective: string | null | undefined
): SectionType | null {
  if (!objective) return null;
  const digest = objective.trim().toLowerCase().replace(/\s+/g, " ");
  if (!digest) return null;
  if (digest in ELR_INVENTORY_SCHEMAS) {
    return digest as SectionType;
  }
  const sections = inventorySections().filter(
    (section) => ELR_INVENTORY_SCHEMAS[section]
  );
  const ranked = sections
    .map((section) => {
      const noun = section.replace(/^elr_/, "").replace(/_/g, " ");
      return { section, noun };
    })
    .sort((a, b) => b.noun.length - a.noun.length);
  for (const { section, noun } of ranked) {
    if (noun.length >= 3 && digest.includes(noun)) return section;
  }
  return null;
}

export function isElrInventoryReviewObjective(
  ...objectives: Array<string | null | undefined>
): boolean {
  return objectives.some((objective) =>
    Boolean(inventorySectionForObjective(objective))
  );
}

function sectionNoun(section: SectionType): string {
  return section.replace(/^elr_/, "").replace(/_/g, " ");
}

export function hasTypedSectionNoun(
  haystack: string,
  noun: string
): boolean {
  const escaped = noun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (noun.includes(" ")) {
    return haystack.includes(noun);
  }
  if (noun.length < 6) return false;
  const re = new RegExp(
    `\\b([a-z][a-z0-9-]{3,})\\s+${escaped}\\b|\\b${escaped}\\s+([a-z][a-z0-9-]{3,})\\b`,
    "gi"
  );
  for (const match of haystack.matchAll(re)) {
    const other = (match[1] ?? match[2] ?? "").toLowerCase();
    if (other && !GENERIC_SECTION_NOUN_OTHER.has(other)) return true;
  }
  return false;
}

function pageHaystack(page: InventoryPageInput): string {
  return [
    page.outlineTitle ?? "",
    page.pageContext ?? "",
    page.filename ?? "",
    (page.transcript ?? "").slice(0, 800),
  ]
    .join(" ")
    .toLowerCase();
}

function hasMultiWordColumnPhrase(
  haystack: string,
  schema: readonly MatrixColumnSchema<string>[]
): boolean {
  for (const col of schema) {
    for (const needle of needlesForColumn(col)) {
      if (needle.includes(" ") && haystack.includes(needle)) return true;
    }
  }
  return false;
}

/**
 * Score a page against the live inventory table, not a canned list of
 * row values. Returns null when the objective is not an ELR inventory
 * section so callers fall back to token / stemming families.
 */
export function scoreInventoryReviewPage(
  page: InventoryPageInput,
  objective: string
): number | null {
  const section = inventorySectionForObjective(objective);
  if (!section) return null;
  const schema = ELR_INVENTORY_SCHEMAS[section];
  if (!schema) return null;

  const haystack = pageHaystack(page);
  let columnHits = 0;
  for (const col of schema) {
    const needles = needlesForColumn(col);
    if (needles.some((needle) => haystack.includes(needle))) columnHits += 1;
  }
  const typed = hasTypedSectionNoun(haystack, sectionNoun(section));
  const hasSectionToken = sectionNoun(section)
    .split(" ")
    .some((token) => token.length >= 6 && haystack.includes(token));
  const dated = DATE_RE.test(haystack);

  if (typed) return (columnHits + 1 + (dated ? 1 : 0)) * 8;
  if (columnHits >= 2) return columnHits * 8;
  if (columnHits >= 1 && (hasSectionToken || dated)) {
    return (columnHits + (dated ? 1 : 0)) * 8;
  }
  if (hasMultiWordColumnPhrase(haystack, schema)) return 8;
  return 0;
}
