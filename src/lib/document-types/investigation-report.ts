import path from "node:path";
import {
  getInvestigationCriteriaBySection,
  getInvestigationEvaluatableSections,
} from "@/lib/ai/criteria";
import { SECTION_SYSTEM_PROMPT_ADDITIONS } from "@/lib/ai/section-prompts";
import {
  RICH_FIELD_PATHS,
  SUGGEST_TARGET_FIELD_PATTERNS,
} from "@/lib/ai/suggest-target-fields";
import type { CustomerPack } from "@/lib/customers";
import { getCustomerPack } from "@/lib/customers/packs";
import { mergeSection } from "@/lib/sections-merge";
import {
  EMPTY_CONTENT,
  EDITABLE_SECTIONS,
  REPORT_SECTION_ROW_ORDER,
  SECTION_LABELS,
} from "@/types/sections";
import type { DocumentTypeDefinition, SectionDefinition } from "./types";

const editableSet = new Set<string>(EDITABLE_SECTIONS);

function investigationPersona(includeConclusion: boolean): string {
  const dmaic = includeConclusion
    ? "Define, Measure, Analyze, Improve, Control, Conclusion"
    : "Define, Measure, Analyze, Improve, Control";
  return `You are the drafting assistant for a deviation investigation report tool used in regulated pharmaceutical and medical device environments. You help quality and operations staff document, investigate, and close deviations, non-conformances, and quality events in a structured DMAIC investigation report (${dmaic}).

Your guidance should reflect GMP / quality-system expectations (traceability, impact assessment, root cause, corrective and preventive action) without inventing company-specific SOP numbers, site names, or product details the engineer has not provided.

The report is graded against fixed quality criteria (a traffic-light check). Your job is to help the engineer produce a first draft that satisfies as many criteria as possible, then refine it.

You never write to the document directly. Every change is a PROPOSAL that appears as an inline tracked-change (red delete / green insert) the engineer accepts or rejects.`;
}

export function buildInvestigationReportDefinition(
  pack: CustomerPack = getCustomerPack()
): DocumentTypeDefinition {
  const hidden = new Set(pack.hiddenInvestigationSections);
  const evaluableSet = new Set<string>(getInvestigationEvaluatableSections());
  const sections: SectionDefinition[] = REPORT_SECTION_ROW_ORDER.filter(
    (key) => !hidden.has(key)
  ).map((key, index) => ({
    key,
    label: SECTION_LABELS[key],
    order: index,
    editable: editableSet.has(key),
    evaluable: evaluableSet.has(key),
    isGateSection: key === "define",
    emptyContent: EMPTY_CONTENT[key],
  }));

  const criteriaBySection = getInvestigationCriteriaBySection();
  const includeConclusion = !hidden.has("conclusion");

  return {
    key: "investigation_report",
    label: "Investigation Report",
    documentNoun: "deviation",
    documentNoLabel: "Deviation Number",
    sections,
    criteriaBySection,
    prompts: {
      base: pack.evaluationSystemPrompt,
      perSection: Object.fromEntries(
        Object.entries(SECTION_SYSTEM_PROMPT_ADDITIONS).filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === "string" && !hidden.has(entry[0])
        )
      ),
      promptVersion: pack.promptVersion,
    },
    chat: {
      persona: investigationPersona(includeConclusion),
      draftOrder: (
        [
          "define",
          "analyze",
          "measure",
          "improve",
          "control",
          "conclusion",
        ] as const
      ).filter((key) => !hidden.has(key)),
      sectionIntentPatterns: (
        [
          [
            "define",
            [
              /\bdefine\b/i,
              /\bproblem statement\b/i,
              /\bdeviation description\b/i,
              /\bwhat happened\b/i,
            ],
          ],
          [
            "measure",
            [
              /\bmeasure\b/i,
              /\bmeasurement plan\b/i,
              /\bexperiment\b/i,
              /\bdata collection\b/i,
            ],
          ],
          [
            "analyze",
            [
              /\banalyz/i,
              /\broot cause\b/i,
              /\b5[-\s]?why\b/i,
              /\bfishbone\b/i,
              /\b6m\b/i,
              /\bimpact assessment\b/i,
            ],
          ],
          [
            "improve",
            [
              /\bimprove\b/i,
              /\bcorrective\b/i,
              /\bcapa\b/i,
              /\bcorrective action\b/i,
            ],
          ],
          [
            "control",
            [
              /\bcontrol\b/i,
              /\bpreventive\b/i,
              /\bmonitoring\b/i,
              /\bpreventive action\b/i,
            ],
          ],
          [
            "conclusion",
            [
              /\bconclusion\b/i,
              /\binvestigation outcome\b/i,
              /\bclosing summary\b/i,
            ],
          ],
        ] as const
      ).filter(([key]) => !hidden.has(key)),
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
        pack.investigationTemplateFile
      ),
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
}

export const investigationReportDefinition: DocumentTypeDefinition =
  buildInvestigationReportDefinition();
