import type { DocumentType } from "@/db/schema";
import { isDocumentTypeEnabled, getCustomerPack } from "@/lib/customers/packs";
import { buildInvestigationReportDefinition } from "./investigation-report";
import { buildDesignVerificationDefinition } from "./design-verification";
import { mechanicalDesignVerificationDefinition } from "./mechanical-design-verification";
import type {
  CriterionDefinition,
  DocumentTypeDefinition,
  SectionDefinition,
} from "./types";
import {
  evaluableSections,
  getSectionDefinition,
  isValidSectionForType,
  seedableSections,
  workspaceSections,
} from "./types";

export function getDocumentType(type: DocumentType): DocumentTypeDefinition {
  switch (type) {
    case "investigation_report":
      return buildInvestigationReportDefinition();
    case "design_verification":
      return buildDesignVerificationDefinition();
    case "mechanical_design_verification":
      return mechanicalDesignVerificationDefinition;
    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown document type: ${exhaustive}`);
    }
  }
}

export function resolveDocumentType(
  type: DocumentType | null | undefined
): DocumentType {
  if (
    type === "investigation_report" ||
    type === "design_verification" ||
    type === "mechanical_design_verification"
  ) {
    return type;
  }
  return "investigation_report";
}

export function listDocumentTypes(): DocumentTypeDefinition[] {
  return getCustomerPack().enabledDocumentTypes.map((type) =>
    getDocumentType(type)
  );
}

export function getCriteria(
  documentType: DocumentType,
  section: string
): CriterionDefinition[] {
  return getDocumentType(documentType).criteriaBySection[section] ?? [];
}

export function getCriteriaForDocument(
  documentType: DocumentType
): Record<string, CriterionDefinition[]> {
  return getDocumentType(documentType).criteriaBySection;
}

export function getEvaluatableSections(
  documentType: DocumentType
): SectionDefinition[] {
  return evaluableSections(getDocumentType(documentType));
}

export function getSeedableSections(
  documentType: DocumentType
): SectionDefinition[] {
  return seedableSections(getDocumentType(documentType));
}

export function getWorkspaceSections(
  documentType: DocumentType
): SectionDefinition[] {
  return workspaceSections(getDocumentType(documentType));
}

export function isValidSection(
  documentType: DocumentType | null | undefined,
  section: string
): boolean {
  return isValidSectionForType(
    getDocumentType(resolveDocumentType(documentType)),
    section
  );
}

export function resolveSection(
  documentType: DocumentType,
  section: string
): SectionDefinition | undefined {
  return getSectionDefinition(getDocumentType(documentType), section);
}

export function mergeSectionForType(
  documentType: DocumentType,
  section: string,
  raw: unknown
): unknown {
  return getDocumentType(documentType).mergeSection(section, raw);
}

export function buildEvaluationSystemPromptForType(
  documentType: DocumentType,
  section: string
): string {
  const def = getDocumentType(documentType);
  const addition = def.prompts.perSection[section];
  if (!addition?.trim()) return def.prompts.base;
  return `${def.prompts.base}\n\n${addition}`;
}

export function engineerReportsSubtitle(
  types: readonly { label: string }[] = listDocumentTypes()
): string {
  const names = types.map((type) =>
    type.label.replace(/ report$/i, "").toLowerCase()
  );
  if (names.length === 0) return "Create and manage reports.";
  if (names.length === 1) return `Create and manage ${names[0]} reports.`;
  const head = names.slice(0, -1).join(", ");
  const last = names[names.length - 1];
  return `Create and manage ${head} and ${last} reports.`;
}

export { isDocumentTypeEnabled };

export type {
  CriterionDefinition,
  DocumentTypeDefinition,
  DocumentTypeChatConfig,
  SectionDefinition,
  EvaluationContext,
} from "./types";
export {
  seedableSections,
  evaluableSections,
  workspaceSections,
  isValidSectionForType,
} from "./types";
