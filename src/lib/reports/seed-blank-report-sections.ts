import type { SectionType } from "@/db/schema";
import type { SectionContentMap } from "@/types/sections";
import { EMPTY_CONTENT } from "@/types/sections";
import { buildDefaultGuidancePreamble } from "@/lib/report-section-guidance";
import { legacyStringToDoc } from "@/lib/tiptap/rich-text";

const SEED_SECTIONS: SectionType[] = ["define", "measure", "improve", "control"];

/** Default section payloads for reports created without a DOCX upload. */
export function seedBlankReportSections(): SectionContentMap {
  const sections = { ...EMPTY_CONTENT };

  for (const section of SEED_SECTIONS) {
    const preamble = buildDefaultGuidancePreamble(section);
    if (!preamble) continue;

    if (section === "define" || section === "measure") {
      sections[section] = {
        ...sections[section],
        narrative: legacyStringToDoc(preamble),
      };
    } else if (section === "improve") {
      sections.improve = {
        ...sections.improve,
        correctiveActions: legacyStringToDoc(preamble.trimEnd()),
      };
    } else if (section === "control") {
      sections.control = {
        ...sections.control,
        preventiveActions: legacyStringToDoc(preamble.trimEnd()),
      };
    }
  }

  return sections;
}
