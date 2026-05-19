import type { SectionType } from "@/db/schema";
import type { SectionContentMap } from "@/types/sections";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";

/** Plain-text section fields that can contain `[Label: <to be filled>]` tokens. */
export const PLAIN_TEXT_PLACEHOLDER_PATHS: Partial<
  Record<SectionType, readonly string[]>
> = {
  measure: ["regulatoryNotification"],
  improve: ["correctiveActions"],
  control: ["preventiveActions"],
  analyze: [
    "sixM.man",
    "sixM.machine",
    "sixM.measurement",
    "sixM.material",
    "sixM.method",
    "sixM.milieu",
    "sixM.conclusion",
    "fiveWhy.narrative",
    "brainstorming",
    "otherTools",
    "investigationOutcome",
    "rootCause.narrative",
    "rootCause.primaryLevel1",
    "rootCause.secondaryLevel2",
    "rootCause.thirdLevel3",
    "impactAssessment.system",
    "impactAssessment.document",
    "impactAssessment.product",
    "impactAssessment.equipment",
    "impactAssessment.patientSafety",
  ],
};

export function isPlainTextPlaceholderField(contentPath: string): boolean {
  return contentPath !== "narrative";
}

export function listPlainTextFieldsForSection(
  section: SectionType,
  content: unknown
): Array<{ contentPath: string; text: string }> {
  const paths = PLAIN_TEXT_PLACEHOLDER_PATHS[section];
  if (!paths?.length || !content || typeof content !== "object") return [];

  const record = content as Record<string, unknown>;
  return paths
    .map((contentPath) => ({
      contentPath,
      text: getPlainTextFieldValue(record, contentPath),
    }))
    .filter((row) => row.text.length > 0);
}

export function setPlainTextFieldValue(
  content: SectionContentMap[SectionType],
  contentPath: string,
  nextText: string
): SectionContentMap[SectionType] {
  const record = structuredClone(content) as Record<string, unknown>;
  const parts = contentPath.split(".").filter(Boolean);
  let cursor: Record<string, unknown> = record;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const child = cursor[key];
    if (!child || typeof child !== "object" || Array.isArray(child)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = nextText;
  return record as SectionContentMap[SectionType];
}
