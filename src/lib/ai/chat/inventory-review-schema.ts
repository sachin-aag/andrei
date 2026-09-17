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
  // Running-header tokens on every GMP page — not evidence that the page
  // belongs to this inventory table. Keep "document reference no".
  "document no",
  "document ref",
  "initiated",
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

/** Nested PRQR chapters often start after a GMP header; 800 chars never reached them. */
export const PAGE_OBJECTIVE_TRANSCRIPT_CHARS = 4000;

const HEADER_ONLY_PHRASES = [
  "uncontrolled copy",
  "reviewed by qa",
  "confidential and proprietary",
  "sign/date",
  "sign / date",
] as const;

/**
 * Grade A / environmental *methods* — not column headers. Used to score
 * nested PRQR chapters that never repeat "Monitoring Parameter".
 */
const MONITORING_METHOD_PHRASES = [
  "non-viable",
  "non viable",
  "particulate monitoring",
  "active viable",
  "settle plate",
  "glove monitoring",
  "surface and glove",
  "differential pressure",
  "laf velocity",
  "air velocity",
  "environmental monitoring",
] as const;

/** Alarm-trend pages that belong in Monitoring as well as Alarm Trends. */
const MONITORING_ALARM_PHRASES = [
  "alarm trend",
  "alarm description",
  "alarm code",
  "nitrogen not available",
  "fm nitrogen",
  "compressed air",
] as const;

function methodPhrasesForSection(section: SectionType): readonly string[] {
  if (section === "elr_monitoring") {
    return [...MONITORING_METHOD_PHRASES, ...MONITORING_ALARM_PHRASES];
  }
  return [];
}

function preferredFilenameFamilies(
  section: SectionType
): readonly (readonly string[])[] {
  switch (section) {
    case "elr_monitoring":
      return [
        ["prqr", "prqp", "pqr", "environmental"],
        ["alarm", "aap"],
      ];
    case "elr_qms":
      return [["ccf", "capa", "cpa", "dev/", "qdf", "prqr"]];
    case "elr_breakdowns":
      return [["pmc", "breakdown", "prqr"]];
    case "elr_qualification":
      return [["prqr", "prqp", "pqr"]];
    case "elr_alarms":
      return [["alarm", "aap"]];
    default:
      return [];
  }
}

function preferredFilenameNeedles(section: SectionType): readonly string[] {
  return preferredFilenameFamilies(section).flat();
}

/** CSV-OQ / RTM / URS pages name "environmental monitoring" without being the EM grid. */
export function isDemotedInventoryFilename(
  filename: string | null | undefined
): boolean {
  if (!filename) return false;
  const n = filename.toLowerCase();
  if (n.includes("csv-oq") || n.includes("csv oq")) return true;
  if (n.includes("rtm for") || /\brtm\b/.test(n)) return true;
  if (/\burs\b/.test(n) || n.includes("user requirement")) return true;
  return false;
}

export function isPreferredInventoryFilename(
  filename: string | null | undefined,
  section: SectionType
): boolean {
  if (!filename) return false;
  const n = filename.toLowerCase();
  return preferredFilenameNeedles(section).some((needle) => n.includes(needle));
}

/**
 * True when a preferred evidence family was skipped while nothing in that
 * family was queued. Monitoring treats PRQR and the alarm-trend PDF as
 * separate families — skipping the alarm file while PRQR was queued is
 * still unfinished.
 */
export function preferredInventoryEvidenceSkipped(
  section: SectionType,
  queuedFilenames: readonly string[],
  skippedFilenames: readonly string[]
): boolean {
  const families = preferredFilenameFamilies(section);
  if (families.length === 0) return false;
  return families.some((needles) => {
    const hits = (name: string) =>
      needles.some((needle) => name.toLowerCase().includes(needle));
    if (!skippedFilenames.some(hits)) return false;
    return !queuedFilenames.some(hits);
  });
}

function methodPhraseHits(haystack: string, section: SectionType): number {
  let hits = 0;
  for (const phrase of methodPhrasesForSection(section)) {
    if (haystack.includes(phrase)) hits += 1;
  }
  return hits;
}

const SIGN_DATE_RE = /\bsign\s*\/\s*date\b/;

/** Signature / UNCONTROLLED COPY chrome with almost no body — not inventory evidence. */
export function isInventoryHeaderOnlyPage(page: PageObjectiveText): boolean {
  const slice = (page.transcript ?? "")
    .toLowerCase()
    .slice(0, PAGE_OBJECTIVE_TRANSCRIPT_CHARS);
  const headerHit =
    HEADER_ONLY_PHRASES.some((phrase) => slice.includes(phrase)) ||
    SIGN_DATE_RE.test(slice);
  if (!headerHit) return false;
  let stripped = slice.replace(SIGN_DATE_RE, " ");
  for (const phrase of HEADER_ONLY_PHRASES) {
    stripped = stripped.split(phrase).join(" ");
  }
  const remaining = stripped.replace(/[^a-z0-9]+/g, " ").trim();
  if (
    methodPhrasesForSection("elr_monitoring").some((phrase) =>
      remaining.includes(phrase)
    )
  ) {
    return false;
  }
  return remaining.length < 120;
}

export type PageObjectiveText = {
  filename?: string | null;
  transcript?: string | null;
  pageContext?: string | null;
  outlineTitle?: string | null;
};

type InventoryPageInput = PageObjectiveText;

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

/**
 * True when a filename is typed as a *different* ELR inventory than the
 * current objective (e.g. "Master Annual Calibration Planner" during QMS).
 * PRQR / PQP names that do not carry another section noun stay in scope.
 */
export function filenameConflictsWithInventoryObjective(
  filename: string | null | undefined,
  objective: string
): boolean {
  const current = inventorySectionForObjective(objective);
  if (!current || !filename) return false;
  const haystack = filename.toLowerCase();
  for (const section of inventorySections()) {
    if (section === current) continue;
    // Monitoring also compiles alarm-trend details — do not drop those files.
    if (current === "elr_monitoring" && section === "elr_alarms") continue;
    if (hasTypedSectionNoun(haystack, sectionNoun(section))) return true;
  }
  return false;
}

/** Ready files to page-list for an inventory walk. Never returns empty when `ready` is not. */
export function inventoryReadyIdsForObjective<
  T extends { attachmentId: string; filename?: string | null },
>(ready: readonly T[], objective: string): string[] {
  const kept = ready.filter(
    (doc) => !filenameConflictsWithInventoryObjective(doc.filename, objective)
  );
  return (kept.length > 0 ? kept : ready).map((doc) => doc.attachmentId);
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

/** Shared haystack for inventory scoring and generic review-page scoring. */
export function pageObjectiveHaystack(page: PageObjectiveText): string {
  return [
    page.outlineTitle ?? "",
    page.pageContext ?? "",
    page.filename ?? "",
    (page.transcript ?? "").slice(0, PAGE_OBJECTIVE_TRANSCRIPT_CHARS),
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
  if (isInventoryHeaderOnlyPage(page)) return 0;

  const haystack = pageObjectiveHaystack(page);
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
  const methods = methodPhraseHits(haystack, section);

  let score = 0;
  if (typed) {
    score = (columnHits + 1 + (dated ? 1 : 0) + methods) * 8;
  } else if (columnHits >= 2) {
    score = (columnHits + methods) * 8;
  } else if (columnHits >= 1 && (hasSectionToken || dated || methods > 0)) {
    score = (columnHits + (dated ? 1 : 0) + methods) * 8;
  } else if (methods > 0) {
    score = methods * 8;
  } else if (hasMultiWordColumnPhrase(haystack, schema)) {
    score = 8;
  }

  if (score > 0 && isPreferredInventoryFilename(page.filename, section)) {
    score += 8;
  }

  if (isDemotedInventoryFilename(page.filename)) {
    // URS / CSV-OQ / RTM may name "environmental monitoring" and carry a
    // revision date. Require a dated result table (two distinctive columns).
    if (!(dated && columnHits >= 2)) return 0;
  }

  return score;
}
