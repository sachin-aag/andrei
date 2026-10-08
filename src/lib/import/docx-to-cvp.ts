import type { JSONContent } from "@tiptap/core";
import PizZip from "pizzip";
import { plainTextFromTiptapJson } from "@/lib/section-content-normalize";
import {
  CVP_DEFAULT_METADATA,
  CVP_EQUIPMENT_H3_OUTLINE,
  CVP_EQUIPMENT_H4_OUTLINE,
  CVP_SECTION_KEYS,
  isCvpTableSectionKey,
  type CvpMetadata,
  type CvpSectionContent,
  type CvpSectionKey,
} from "@/lib/document-types/cvp/sections";
import { normalizeCvpEquipmentSamplingContent } from "@/lib/document-types/cvp/equipment-sampling";
import { docxBufferToGenericDocument } from "@/lib/import/docx-to-generic-document";

const FIXED_HEADINGS: Record<string, CvpSectionKey> = {
  APPROVALSIGNATURES: "cvp_approvals",
  OBJECTIVE: "cvp_objective",
  SCOPE: "cvp_scope",
  RESPONSIBILITIES: "cvp_responsibilities",
  BACKGROUNDANDCLEANINGPROCEDURE: "cvp_background",
  PREREQUISITES: "cvp_prerequisites",
  EQUIPMENTQUALIFICATIONSTATUS: "cvp_qualification_status",
  SURFACEAREAOFTHEEQUIPMENT: "cvp_surface_area",
  RINSEVOLUMECALCULATION: "cvp_rinse_volume",
  MAXIMUMALLOWABLECARRYOVERMACO: "cvp_maco",
  ACCEPTANCELIMITCALCULATIONSWABANDRINSE: "cvp_acceptance_limits",
  CLEANINGVERIFICATIONMETHODOLOGY: "cvp_methodology",
  CLEANINGVALIDATIONMETHODOLOGY: "cvp_methodology",
  SAMPLINGPROCEDURE: "cvp_sampling_procedure",
  DETERMINATIONOFSWABSAMPLELOCATIONS: "cvp_swab_locations",
  SAMPLINGPLANACCEPTANCECRITERIAANDCLEANINGVERIFICATIONRESULTSSUMMARY:
    "cvp_sampling_plan",
  SAMPLINGPLANACCEPTANCECRITERIAANDCLEANINGVALIDATIONRESULTSSUMMARY:
    "cvp_sampling_plan",
  NITROSAMINELIMITSINTHERINSESAMPLES: "cvp_nitrosamine",
  POTENTIALGENOTOXICIMPURITIESLIMITSINTHERINSESAMPLES: "cvp_pgi",
  PROCESSLINECLEANINGVERIFICATIONSUMMARY: "cvp_process_line",
  PROCESSLINECLEANINGVALIDATIONSUMMARY: "cvp_process_line",
  MANUFACTURINGAREACLEANINGVERIFICATION: "cvp_manufacturing_area",
  MANUFACTURINGAREACLEANINGVALIDATION: "cvp_manufacturing_area",
  OVERALLCLEANINGRESULTSSUMMARY: "cvp_overall_results",
  TESTINGPROCEDURE: "cvp_testing_procedure",
  STATUSOFCLEANINGANALYTICALMETHODVALIDATION: "cvp_method_validation",
  EVALUATIONOFRESULTSANDREPORTING: "cvp_evaluation",
  DEVIATIONS: "cvp_deviations",
  REVALIDATION: "cvp_revalidation",
  ABBREVIATIONS: "cvp_abbreviations",
  RELATEDDOCUMENTS: "cvp_related_documents",
  LISTOFANNEXURES: "cvp_annexures",
  HISTORYOFTHEDOCUMENT: "cvp_history",
};

const EQUIPMENT_ID_RE = /\([A-Z]{2,8}-?\d{3,}/i;
const TOC_GLUE_RE = /^\d+\.\d+[A-Z].*\d+$/i;
const NUMBERED_EQUIPMENT_RE = /^15\.(?:[1-9]|10)\b/;
const NITROSAMINE_OR_PGI_RE = /^15\.1[12]\b/;

export type ImportedCvpDocument = {
  protocolNo: string;
  metadata: CvpMetadata;
  sections: Partial<Record<CvpSectionKey, CvpSectionContent>>;
  warnings: string[];
};

export async function docxBufferToImportedCvp(
  buffer: Buffer
): Promise<ImportedCvpDocument> {
  const generic = await docxBufferToGenericDocument(buffer);
  const header = extractCvpHeaderFields(buffer);
  const split = splitCvpNarrativeIntoSections(generic.narrative);
  const metadata = mergeCvpMetadata(split.cover, header);
  const warnings = [...generic.warnings];
  if (Object.keys(split.sections).length === 0) {
    warnings.push(
      "Could not find numbered section headings. Nothing was imported into the protocol sections."
    );
  }
  return {
    protocolNo: header.protocolNo.trim(),
    metadata,
    sections: split.sections,
    warnings: [...new Set(warnings)],
  };
}

export function protocolNoFromCompactHeader(compact: string): string {
  const match = /ProtocolNo\.?([A-Z0-9-]+)/i.exec(compact.replace(/\s+/g, ""));
  if (!match?.[1]) return "";
  return match[1].replace(/Version.*$/i, "");
}

export function extractCvpHeaderFields(buffer: Buffer): CvpMetadata & {
  protocolNo: string;
} {
  let zip: PizZip;
  try {
    zip = new PizZip(buffer);
  } catch {
    return { ...CVP_DEFAULT_METADATA, protocolNo: "" };
  }
  const headerXml = Object.keys(zip.files)
    .filter((name) => /^word\/header\d+\.xml$/i.test(name))
    .map((name) => zip.file(name)?.asText() ?? "")
    .join("\n");
  const headerText = xmlPlainText(headerXml);
  const compact = headerText.replace(/\s+/g, "");
  const protocolNo = protocolNoFromCompactHeader(compact);
  const versionMatch = /Version#(\d+)/i.exec(compact);
  const titleMatch =
    /Document Title:\s*(.+?)\s*Department/i.exec(headerText.replace(/\s+/g, " ")) ??
    /DocumentTitle:(.+?)Department/i.exec(compact);
  const departmentMatch = /Department\s*([A-Za-z]+?)(?=Protocol|Page|Version|$)/i.exec(
    headerText.replace(/\s+/g, " ")
  );
  const effectiveMatch =
    /Effective Date[:\s]*([0-9]{1,2}[-/.][A-Za-z0-9]+[-/.][0-9]{2,4})/i.exec(
      headerText.replace(/\s+/g, " ")
    );
  return {
    ...CVP_DEFAULT_METADATA,
    protocolNo,
    version: versionMatch?.[1] ?? CVP_DEFAULT_METADATA.version,
    documentTitle: cleanHeaderValue(titleMatch?.[1] ?? ""),
    department:
      cleanHeaderValue(departmentMatch?.[1] ?? "") ||
      CVP_DEFAULT_METADATA.department,
    effectiveDate: cleanHeaderValue(effectiveMatch?.[1] ?? ""),
  };
}

export function splitCvpNarrativeIntoSections(narrative: JSONContent): {
  cover: Partial<CvpMetadata>;
  sections: Partial<Record<CvpSectionKey, CvpSectionContent>>;
} {
  const nodes = narrative.content ?? [];
  const buckets: Record<CvpSectionKey, JSONContent[]> = Object.fromEntries(
    CVP_SECTION_KEYS.map((key) => [key, [] as JSONContent[]])
  ) as Record<CvpSectionKey, JSONContent[]>;
  let mode: CvpSectionKey | "preamble" | "toc" = "preamble";

  for (const node of nodes) {
    const text = nodeText(node);
    if (headingKey(text) === "TABLEOFCONTENTS") {
      mode = "toc";
      continue;
    }
    const heading = matchCvpSectionHeading(node, text);
    if (heading) {
      mode = heading.key;
      if (heading.keep) buckets[heading.key].push(node);
      continue;
    }
    if (mode === "preamble" || mode === "toc") continue;
    buckets[mode].push(node);
  }

  const sections: Partial<Record<CvpSectionKey, CvpSectionContent>> = {};
  for (const key of CVP_SECTION_KEYS) {
    const content = contentForSection(key, buckets[key]);
    if (content) sections[key] = content;
  }
  return {
    cover: extractCvpCoverIdentity(nodes),
    sections,
  };
}

function contentForSection(
  key: CvpSectionKey,
  nodes: JSONContent[]
): CvpSectionContent | null {
  const promoted =
    key === "cvp_equipment_sampling"
      ? promoteCvpEquipmentOutline(nodes)
      : nodes;
  const meaningful = promoted.filter((node) => !isEmptyNode(node));
  if (meaningful.length === 0) return null;
  if (isCvpTableSectionKey(key)) {
    const tables = meaningful.filter((node) => node.type === "table");
    if (tables.length === 0) return null;
    return { table: { type: "doc", content: tables } };
  }
  if (key === "cvp_equipment_sampling") {
    return normalizeCvpEquipmentSamplingContent({
      narrative: { type: "doc", content: meaningful },
    });
  }
  return { narrative: { type: "doc", content: meaningful } };
}

function matchCvpSectionHeading(
  node: JSONContent,
  text: string
): { key: CvpSectionKey; keep: boolean } | null {
  if (isCvpTocLine(text)) return null;
  if (!looksLikeHeading(node, text)) return null;
  const compact = headingKey(text);
  const fixed = FIXED_HEADINGS[compact];
  if (fixed) return { key: fixed, keep: false };
  if (isEquipmentHeading(text)) {
    return { key: "cvp_equipment_sampling", keep: true };
  }
  return null;
}

function looksLikeHeading(node: JSONContent, text: string): boolean {
  if (node.type === "heading") return true;
  if (node.type !== "paragraph" || text.length > 140) return false;
  const compact = headingKey(text);
  return (
    compact === "TABLEOFCONTENTS" ||
    Boolean(FIXED_HEADINGS[compact]) ||
    isEquipmentHeading(text)
  );
}

const EQUIPMENT_INNER_HEADINGS: ReadonlyArray<{
  compact: string;
  level: 3 | 4;
  numbered: string;
}> = [
  ...CVP_EQUIPMENT_H3_OUTLINE.map((item) => ({
    compact: compactOutlineTitle(item.title),
    level: 3 as const,
    numbered: `${item.number} ${item.title}`,
  })),
  ...CVP_EQUIPMENT_H4_OUTLINE.map((item) => ({
    compact: compactOutlineTitle(item.title),
    numbered: `${item.number} ${item.title}`,
    level: 4 as const,
  })),
];

function compactOutlineTitle(text: string): string {
  return text
    .replace(/^(?:\d+|N)+(?:\.(?:\d+|N))*\.?\s+/i, "")
    .replace(/:$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function matchEquipmentInnerHeading(text: string) {
  const compact = compactOutlineTitle(text);
  return EQUIPMENT_INNER_HEADINGS.find((item) => item.compact === compact) ?? null;
}

function paragraphIsBoldHeading(node: JSONContent): boolean {
  if (node.type === "heading") return true;
  if (node.type !== "paragraph") return false;
  const runs = node.content ?? [];
  if (runs.length === 0) return false;
  return runs.every(
    (child) =>
      child.type !== "text" ||
      (child.marks ?? []).some((mark) => mark.type === "bold")
  );
}

function headingNode(level: 2 | 3 | 4, text: string): JSONContent {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

function numberedEquipmentTitle(text: string, ordinal: number): string {
  const trimmed = text.replace(/:$/, "").trim();
  if (/^15\.(?:[1-9]|10)\b/.test(trimmed)) return trimmed;
  return `15.${ordinal} ${trimmed}`;
}

function applyOutlineNumber(template: string, ordinal: number): string {
  return template.replaceAll("15.N", `15.${ordinal}`);
}

/** Promote Word BodyText 15.N.M / 15.N.M.P lines to H2–H4 with form numbers. */
export function promoteCvpEquipmentOutline(nodes: JSONContent[]): JSONContent[] {
  let equipmentIndex = 0;
  return nodes.map((node) => {
    const text = nodeText(node);
    if (!text) return node;
    if (isEquipmentHeading(text)) {
      equipmentIndex += 1;
      return headingNode(2, numberedEquipmentTitle(text, equipmentIndex));
    }
    const inner = matchEquipmentInnerHeading(text);
    if (!inner) return node;
    if (node.type !== "heading" && !paragraphIsBoldHeading(node) && node.type !== "paragraph") {
      return node;
    }
    const ordinal = Math.min(Math.max(equipmentIndex, 1), 10);
    return headingNode(inner.level, applyOutlineNumber(inner.numbered, ordinal));
  });
}

export function isCvpTocLine(text: string): boolean {
  return TOC_GLUE_RE.test(text.replace(/\s+/g, ""));
}

export function isEquipmentHeading(text: string): boolean {
  const normalized = normalizeHeading(text);
  if (NITROSAMINE_OR_PGI_RE.test(normalized)) return false;
  if (matchEquipmentInnerHeading(text)) return false;
  if (/^15\.(?:[1-9]|10)\.\d/.test(text.trim())) return false;
  if (NUMBERED_EQUIPMENT_RE.test(normalized) || NUMBERED_EQUIPMENT_RE.test(text.trim())) {
    return true;
  }
  return EQUIPMENT_ID_RE.test(normalized) && normalized.length < 120;
}

function extractCvpCoverIdentity(nodes: JSONContent[]): Partial<CvpMetadata> {
  const meta: Partial<CvpMetadata> = {};
  for (const table of collectTables(nodes)) {
    applyCoverTable(meta, table);
    if (coverIdentityComplete(meta)) break;
  }
  if (!coverIdentityComplete(meta)) applyCoverFromLabelSequence(meta, nodes);
  if (!coverIdentityComplete(meta)) {
    applyCoverFromPlainText(meta, nodes.map(nodeText).join("\n"));
  }
  return meta;
}

function coverIdentityComplete(meta: Partial<CvpMetadata>): boolean {
  return Boolean(
    meta.productName && meta.productCode && meta.stage && meta.plant
  );
}

function collectTables(nodes: JSONContent[]): JSONContent[] {
  const tables: JSONContent[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === "table") tables.push(node);
    for (const child of node.content ?? []) walk(child);
  };
  for (const node of nodes) walk(node);
  return tables;
}

function applyCoverTable(meta: Partial<CvpMetadata>, table: JSONContent) {
  for (const row of table.content ?? []) {
    const cells = (row.content ?? []).map((cell) => nodeText(cell).trim());
    if (cells.length < 2) continue;
    const label = (cells[0] ?? "").replace(/:$/, "").trim();
    const value =
      cells.length >= 3 && /^[:.]$/.test(cells[1] ?? "")
        ? cells[2] ?? ""
        : (cells[1] ?? "").replace(/^[:.]\s*/, "");
    applyCoverField(meta, label, value);
  }
}

function applyCoverFromLabelSequence(
  meta: Partial<CvpMetadata>,
  nodes: JSONContent[]
) {
  const texts = nodes
    .filter((node) => node.type !== "table")
    .map(nodeText)
    .filter(Boolean);
  for (let i = 0; i < texts.length; i++) {
    const label = (texts[i] ?? "").replace(/:$/, "").trim();
    let value = texts[i + 1] ?? "";
    if (/^[:.]$/.test(value)) value = texts[i + 2] ?? "";
    applyCoverField(meta, label, value);
  }
}

function applyCoverFromPlainText(
  meta: Partial<CvpMetadata>,
  text: string
) {
  const pick = (pattern: RegExp) =>
    pattern.exec(text)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  applyCoverField(
    meta,
    "name of the product",
    pick(/name of the product\s*:?\s*(.+?)(?=product code|$)/i)
  );
  applyCoverField(
    meta,
    "product code",
    pick(/product code\s*:?\s*(.+?)(?=stage\b|$)/i)
  );
  applyCoverField(meta, "stage", pick(/stage\s*:\s*([^\n]+?)(?=plant\b|$)/i));
  applyCoverField(meta, "plant", pick(/plant\s*:?\s*([^\n]+)/i));
}

function applyCoverField(
  meta: Partial<CvpMetadata>,
  label: string,
  value: string
) {
  const key = label.replace(/\s+/g, " ").trim().toLowerCase();
  const next = value.replace(/\s+/g, " ").trim();
  if (!next) return;
  if (key.startsWith("name of the product")) {
    meta.productName ??= next;
  } else if (key === "product code") {
    meta.productCode ??= next;
  } else if (key === "stage") {
    meta.stage ??= next;
  } else if (key === "plant") {
    meta.plant ??= next;
  }
}

function mergeCvpMetadata(
  cover: Partial<CvpMetadata>,
  header: CvpMetadata
): CvpMetadata {
  const pick = (key: keyof CvpMetadata) =>
    (cover[key] ?? "").trim() || header[key].trim() || CVP_DEFAULT_METADATA[key];
  return {
    productName: pick("productName"),
    productCode: pick("productCode"),
    stage: pick("stage"),
    plant: pick("plant"),
    department: pick("department"),
    documentTitle: pick("documentTitle"),
    version: pick("version"),
    effectiveDate: pick("effectiveDate"),
  };
}

function headingKey(text: string): string {
  return normalizeHeading(text).replace(/[^A-Z0-9]+/g, "");
}

function normalizeHeading(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/:$/, "")
    .replace(/^\d+\.\d+\s+/, "")
    .toUpperCase();
}

function nodeText(node: JSONContent): string {
  return plainTextFromTiptapJson(node).replace(/\s+/g, " ").trim();
}

function isEmptyNode(node: JSONContent): boolean {
  if (node.type === "table") return false;
  if (node.type === "image" || node.type === "imageInline") return false;
  return !nodeText(node);
}

function xmlPlainText(xml: string): string {
  return [...xml.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)]
    .map((match) => decodeXml(match[1] ?? ""))
    .join("");
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanHeaderValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
