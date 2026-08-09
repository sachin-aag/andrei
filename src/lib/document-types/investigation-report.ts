import path from "node:path";
import {
  getInvestigationCriteriaBySection,
  EVALUATABLE_SECTIONS,
} from "@/lib/ai/criteria";
import {
  COMMON_EVALUATION_SYSTEM_PROMPT,
  PROMPT_VERSION,
  SECTION_SYSTEM_PROMPT_ADDITIONS,
} from "@/lib/ai/section-prompts";
import {
  RICH_FIELD_PATHS,
  SUGGEST_TARGET_FIELD_PATTERNS,
} from "@/lib/ai/suggest-target-fields";
import { mergeSection } from "@/lib/sections-merge";
import {
  EMPTY_CONTENT,
  EDITABLE_SECTIONS,
  REPORT_SECTION_ROW_ORDER,
  SECTION_LABELS,
} from "@/types/sections";
import type { DocumentTypeDefinition, SectionDefinition } from "./types";

const evaluableSet = new Set<string>(EVALUATABLE_SECTIONS);
const editableSet = new Set<string>(EDITABLE_SECTIONS);

const sections: SectionDefinition[] = REPORT_SECTION_ROW_ORDER.map(
  (key, index) => ({
    key,
    label: SECTION_LABELS[key],
    order: index,
    editable: editableSet.has(key),
    evaluable: evaluableSet.has(key),
    isGateSection: key === "define",
    emptyContent: EMPTY_CONTENT[key],
  })
);

export const investigationReportDefinition: DocumentTypeDefinition = {
  key: "investigation_report",
  label: "Investigation Report",
  documentNoun: "deviation",
  documentNoLabel: "Deviation Number",
  sections,
  criteriaBySection: getInvestigationCriteriaBySection(),
  prompts: {
    base: COMMON_EVALUATION_SYSTEM_PROMPT,
    perSection: Object.fromEntries(
      Object.entries(SECTION_SYSTEM_PROMPT_ADDITIONS).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    ),
    promptVersion: PROMPT_VERSION,
  },
  suggestTargetFieldPatterns: SUGGEST_TARGET_FIELD_PATTERNS as Record<
    string,
    readonly string[]
  >,
  richFieldPaths: RICH_FIELD_PATHS as Record<string, readonly string[]>,
  mergeSection: (key, raw) =>
    mergeSection(key as keyof typeof EMPTY_CONTENT, raw),
  export: {
    templatePath: path.join(
      process.cwd(),
      "templates",
      "investigation-report-template.docx"
    ),
    // Filled by generate-docx re-export wiring; kept lazy to avoid cycles.
    buildTemplateData: () => {
      throw new Error(
        "investigation_report export.buildTemplateData is wired via generateReportDocx"
      );
    },
  },
  defaultMetadata: {
    toolsUsed: { sixM: false, fiveWhy: false, brainstorming: false },
    otherTools: "",
  },
};
