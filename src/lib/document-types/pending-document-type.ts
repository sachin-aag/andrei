import { COMMON_EVALUATION_SYSTEM_PROMPT } from "@/lib/ai/section-prompts";
import type { DocumentType } from "@/db/schema";
import type { DocumentTypeDefinition } from "./types";

/**
 * Placeholder definition so new enum values typecheck and appear in the create
 * dialog before their full section/criteria files land.
 */
export function pendingDocumentType(
  key: DocumentType,
  label: string
): DocumentTypeDefinition {
  return {
    key,
    label,
    documentNoun: label.toLowerCase(),
    documentNoLabel: "Document Number",
    sections: [],
    criteriaBySection: {},
    prompts: {
      base: COMMON_EVALUATION_SYSTEM_PROMPT,
      perSection: {},
      promptVersion: `${key}-pending`,
    },
    chat: {
      persona: "",
      draftOrder: [],
      sectionIntentPatterns: [],
    },
    suggestTargetFieldPatterns: {},
    richFieldPaths: {},
    mergeSection: (_section, raw) => raw ?? {},
    export: {
      templatePath: "",
      buildTemplateData: () => ({}),
    },
    defaultMetadata: { revision: "" },
  };
}
