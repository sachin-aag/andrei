import { getEvaluatableSections } from "@/lib/document-types";
import type { DocumentType } from "@/db/schema";
import { fdaCriteriaForDocumentType } from "./fda-criteria";
import { runReportCriteriaCheck, reportCriteriaCheckId } from "./checks/report-criteria";
import { runFdaCheck, fdaCheckId } from "./checks/fda";
import { runCitationResolvesCheck, attachmentIndexFrom } from "./checks/citations-resolves";
import { runCitationSupportsCheck } from "./checks/citations-supports";
import { runUncitedFactsCheck } from "./checks/citations-uncited";
import { runExternalRefsCheck } from "./checks/citations-external";
import { runGrammarCheck, runTenseCheck } from "./checks/writing-llm";
import { runTerminologyCheck } from "./checks/writing-terminology";
import { runCrossReferencesCheck } from "./checks/writing-cross-refs";
import type { ReviewCheckDefinition, ReviewCheckId } from "./types";

function always(): boolean {
  return true;
}

const STATIC_CHECKS: ReviewCheckDefinition[] = [
  {
    id: "report.placeholders",
    category: "report",
    label: "Placeholders",
    description: "Unfilled <tokens> still in the report body.",
    standardTag: "Live scan",
    kind: "live",
    appliesTo: always,
  },
  {
    id: "citations.resolves",
    category: "citations",
    label: "Citation resolves",
    description: "Every [n] maps to a Citations list entry and a ready attachment page.",
    standardTag: "Citations",
    kind: "run",
    appliesTo: always,
    run: async (ctx) =>
      runCitationResolvesCheck(ctx, attachmentIndexFrom(ctx.attachmentPages)),
  },
  {
    id: "citations.supports_claim",
    category: "citations",
    label: "Citation supports claim",
    description: "The cited page actually supports the sentence around each [n].",
    standardTag: "Citations",
    kind: "run",
    appliesTo: always,
    run: runCitationSupportsCheck,
  },
  {
    id: "citations.uncited_facts",
    category: "citations",
    label: "Uncited facts",
    description: "Hard facts (dates, IDs, numbers) that have no citation marker.",
    standardTag: "Citations",
    kind: "run",
    appliesTo: always,
    run: runUncitedFactsCheck,
  },
  {
    id: "citations.external_refs",
    category: "citations",
    label: "External references",
    description: "SOP, CFR, and ISO identifiers that are not in the vault.",
    standardTag: "Citations",
    kind: "run",
    appliesTo: always,
    run: runExternalRefsCheck,
  },
  {
    id: "writing.grammar",
    category: "writing",
    label: "Grammar & spelling",
    description: "Grammar and spelling polish that does not change meaning.",
    standardTag: "Style",
    kind: "run",
    appliesTo: always,
    run: runGrammarCheck,
  },
  {
    id: "writing.terminology",
    category: "writing",
    label: "Terminology consistency",
    description: "Batch numbers, equipment IDs, and names that drift in spelling.",
    standardTag: "Style",
    kind: "run",
    appliesTo: always,
    run: runTerminologyCheck,
  },
  {
    id: "writing.cross_references",
    category: "writing",
    label: "Cross-references",
    description: "Table N and Section N mentions that do not resolve.",
    standardTag: "Style",
    kind: "run",
    appliesTo: always,
    run: runCrossReferencesCheck,
  },
  {
    id: "writing.tense",
    category: "writing",
    label: "Tense & voice",
    description: "Executed work should stay in past tense with consistent voice.",
    standardTag: "Style",
    kind: "run",
    appliesTo: always,
    run: runTenseCheck,
  },
];

export function checksForDocumentType(
  documentType: DocumentType
): ReviewCheckDefinition[] {
  const checks: ReviewCheckDefinition[] = [];
  const evaluatable = getEvaluatableSections(documentType);
  for (const section of evaluatable) {
    const sectionKey = section.key;
    checks.push({
      id: reportCriteriaCheckId(sectionKey),
      category: "report",
      label: `${section.label} criteria`,
      description: `Traffic-light quality criteria for ${section.label}.`,
      standardTag: "Report",
      kind: "run",
      appliesTo: (type) =>
        getEvaluatableSections(type).some((row) => row.key === sectionKey),
      run: (ctx) => runReportCriteriaCheck(ctx, sectionKey),
    });
  }
  checks.push(STATIC_CHECKS[0]!);

  for (const criterion of fdaCriteriaForDocumentType(documentType)) {
    checks.push({
      id: fdaCheckId(criterion.key),
      category: "fda",
      label: criterion.label,
      description: criterion.description,
      standardTag: "FDA",
      kind: "run",
      appliesTo: (type) =>
        fdaCriteriaForDocumentType(type).some((row) => row.key === criterion.key),
      run: (ctx) => runFdaCheck(ctx, criterion),
    });
  }

  checks.push(...STATIC_CHECKS.slice(1));
  return checks.filter((check) => check.appliesTo(documentType));
}

export function checkById(
  documentType: DocumentType,
  checkId: string
): ReviewCheckDefinition | undefined {
  return checksForDocumentType(documentType).find((check) => check.id === checkId);
}

export function isKnownCheckId(
  documentType: DocumentType,
  checkId: string
): checkId is ReviewCheckId {
  return checkById(documentType, checkId) != null;
}
