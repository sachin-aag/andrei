import type { SectionContentMap } from "@/types/sections";
import { EMPTY_CONTENT } from "@/types/sections";

/**
 * Default section payloads for reports created without a DOCX upload.
 * Intentionally empty — template checkpoint/criteria lists are not seeded into
 * free-text fields (they confuse AI suggestions). Checkpoints still appear in
 * export when present in imported DOCXs.
 */
export function seedBlankReportSections(): SectionContentMap {
  return { ...EMPTY_CONTENT };
}
