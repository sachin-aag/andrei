import type { DocumentType } from "@/db/schema";
import { investigationReportDefinition } from "./investigation-report";
import { designVerificationDefinition } from "./design-verification";
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

const REGISTRY: Record<DocumentType, DocumentTypeDefinition> = {
  investigation_report: investigationReportDefinition,
  design_verification: designVerificationDefinition,
};

export function getDocumentType(type: DocumentType): DocumentTypeDefinition {
  const def = REGISTRY[type];
  if (!def) {
    throw new Error(`Unknown document type: ${type}`);
  }
  return def;
}

export function resolveDocumentType(
  type: DocumentType | null | undefined
): DocumentType {
  return type && type in REGISTRY ? type : "investigation_report";
}

export function listDocumentTypes(): DocumentTypeDefinition[] {
  return Object.values(REGISTRY);
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

export function getGateSection(
  documentType: DocumentType
): SectionDefinition | undefined {
  return getDocumentType(documentType).sections.find((s) => s.isGateSection);
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
