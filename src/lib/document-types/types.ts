import type { ComponentType } from "react";
import type { CriterionStatus, DocumentType, SectionType } from "@/db/schema";
import type { ReportRecord } from "@/types/report";

export type EvaluationContext = {
  section: SectionType;
  content: unknown;
  /** Content of sections listed in criterion.dependsOn, keyed by section. */
  dependencies: Record<string, unknown>;
  report: ReportRecord;
};

export type CriterionDefinition = {
  key: string;
  label: string;
  description: string;
  kind: "llm" | "deterministic";
  /** Other section keys whose content this criterion reads. */
  dependsOn?: string[];
  /** Required when kind is "deterministic". */
  check?: (ctx: EvaluationContext) => {
    status: CriterionStatus;
    reasoning: string;
  };
};

export type SectionDefinition = {
  key: SectionType;
  label: string;
  order: number;
  editable: boolean;
  evaluable: boolean;
  /**
   * Virtual sections (e.g. DV cover page) live in reports.metadata — they are
   * not seeded into report_sections and have no comments / version rows.
   */
  virtual?: boolean;
  /** Gate section that must have enough context before evaluation may run. */
  isGateSection?: boolean;
  emptyContent: unknown;
};

export type DocumentTypePrompts = {
  base: string;
  perSection: Record<string, string>;
  promptVersion: string;
};

export type DocxTemplateData = Record<string, unknown>;

export type DocumentTypeDefinition = {
  key: DocumentType;
  label: string;
  /** Singular noun for UI copy ("deviation", "design verification"). */
  documentNoun: string;
  /** Label for the document number field. */
  documentNoLabel: string;
  sections: SectionDefinition[];
  criteriaBySection: Record<string, CriterionDefinition[]>;
  prompts: DocumentTypePrompts;
  suggestTargetFieldPatterns: Record<string, readonly string[]>;
  richFieldPaths: Record<string, readonly string[]>;
  mergeSection: (key: string, raw: unknown) => unknown;
  export: {
    templatePath: string;
    buildTemplateData: (args: {
      report: ReportRecord;
      sections: Array<{ section: string; content: unknown }>;
      ctx: unknown;
      comments: unknown[];
    }) => DocxTemplateData;
  };
  submitValidation?: (args: {
    report: ReportRecord;
    sections: Array<{ section: string; content: unknown }>;
  }) => { ok: true } | { ok: false; message: string };
  /** Default metadata jsonb for a newly created report of this type. */
  defaultMetadata: Record<string, unknown>;
  /** Optional editor component registry key → dynamic import. */
  editors?: Record<string, ComponentType>;
};

export function sectionKeys(def: DocumentTypeDefinition): string[] {
  return def.sections.map((s) => s.key);
}

export function seedableSections(def: DocumentTypeDefinition): SectionDefinition[] {
  return def.sections.filter((s) => !s.virtual);
}

export function evaluableSections(def: DocumentTypeDefinition): SectionDefinition[] {
  return def.sections.filter((s) => s.evaluable);
}

export function workspaceSections(def: DocumentTypeDefinition): SectionDefinition[] {
  return def.sections
    .filter((s) => !s.virtual)
    .toSorted((a, b) => a.order - b.order);
}

export function getSectionDefinition(
  def: DocumentTypeDefinition,
  section: string
): SectionDefinition | undefined {
  return def.sections.find((s) => s.key === section);
}

export function isValidSectionForType(
  def: DocumentTypeDefinition,
  section: string
): boolean {
  return def.sections.some((s) => s.key === section);
}
