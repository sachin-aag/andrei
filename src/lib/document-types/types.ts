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
  emptyContent: unknown;
};

export type DocumentTypePrompts = {
  base: string;
  perSection: Record<string, string>;
  promptVersion: string;
};

/** Chat drafting guidance owned by each document type. */
export type DocumentTypeChatConfig = {
  /** Opening persona paragraphs for the chat system prompt. */
  persona: string;
  /** Editable section keys in drafting-priority order (highest signal first). */
  draftOrder: readonly SectionType[];
  /** Section keyword patterns for scope-intent detection. */
  sectionIntentPatterns: ReadonlyArray<
    readonly [SectionType, readonly RegExp[]]
  >;
  /**
   * Open-set work products: missing a member is a failure (traceability /
   * results matrices). Omit or leave empty when the type has none — including
   * one-locus tables such as test equipment. Chat retrieval uses this list
   * instead of matching verbs like "draft" or "complete".
   */
  inventorySections?: readonly SectionType[];
  /**
   * Optional document-type drafting rules appended to the chat system prompt
   * (e.g. fixed table column schemas for matrix sections).
   */
  draftingGuidance?: string;
};

export type DocxTemplateData = Record<string, unknown>;

export type WordImportCapability =
  | { kind: "none" }
  | { kind: "investigation" }
  | { kind: "generic_body" };

export type WorkspacePresentation =
  | { kind: "sections" }
  | { kind: "continuous_document"; outline: boolean };

export type EvaluationCapability = { kind: "criteria" } | { kind: "none" };

export type SuggestionApplyMode = "final" | "tracked_change";

export type EditorProfile = "report_section" | "generic_document";

export type DocumentTypeDefinition = {
  key: DocumentType;
  label: string;
  /** Singular noun for UI copy ("deviation", "design verification"). */
  documentNoun: string;
  /** Label for the document number field. */
  documentNoLabel: string;
  /** Placeholder shown in the create dialog. */
  documentNoPlaceholder?: string;
  /**
   * Word .docx upload at create time. Investigation import is still gated by
   * the customer pack `wordImportEnabled` flag. Generic-body import is type-owned
   * and available whenever the type is enabled.
   */
  wordImport?: WordImportCapability;
  workspacePresentation?: WorkspacePresentation;
  evaluation?: EvaluationCapability;
  /** How accepting an AI suggestion is persisted. Default `final`. */
  suggestionApplyMode?: SuggestionApplyMode;
  /** TipTap schema/toolbar profile. Default `report_section` (no heading nodes). */
  editorProfile?: EditorProfile;
  /**
   * When true, this type uses Convergent's citation mode: numbered `[n]`
   * markers at the claim, with `[filename, p. N]` parked under a trailing
   * Citations: heading. Combined with the pack flag by
   * `citationsAtEndOfSectionFor`.
   */
  citationsAtEndOfSection?: boolean;
  sections: SectionDefinition[];
  criteriaBySection: Record<string, CriterionDefinition[]>;
  prompts: DocumentTypePrompts;
  chat: DocumentTypeChatConfig;
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

export function wordImportFor(def: DocumentTypeDefinition): WordImportCapability {
  if (def.wordImport) return def.wordImport;
  return def.key === "investigation_report"
    ? { kind: "investigation" }
    : { kind: "none" };
}

export function workspacePresentationFor(
  def: DocumentTypeDefinition
): WorkspacePresentation {
  return def.workspacePresentation ?? { kind: "sections" };
}

export function evaluationCapabilityFor(
  def: DocumentTypeDefinition
): EvaluationCapability {
  if (def.evaluation) return def.evaluation;
  return evaluableSections(def).length > 0 ? { kind: "criteria" } : { kind: "none" };
}

export function suggestionApplyModeFor(
  def: DocumentTypeDefinition
): SuggestionApplyMode {
  return def.suggestionApplyMode ?? "final";
}

export function editorProfileFor(def: DocumentTypeDefinition): EditorProfile {
  return def.editorProfile ?? "report_section";
}
