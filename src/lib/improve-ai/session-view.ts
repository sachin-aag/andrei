import type { SectionType, CriterionStatus, DocumentType } from "@/db/schema";
import {
  buildEvaluationSystemPromptForType,
  getCriteria,
  getEvaluatableSections,
} from "@/lib/document-types";
import {
  blocksToPromptText,
  buildSectionDisplayBlocks,
  sectionDisplayBlocksHaveContent,
  type ImproveAiDisplayBlock,
} from "@/lib/improve-ai/section-display-blocks";
import type { AllSectionsContent } from "@/lib/ai/evaluate";
import {
  humanAnswerKey,
  type HumanSubAnswerDraft,
} from "@/lib/improve-ai/human-judgment";
import type { aiFeedbackResponses, aiFeedbackSessions, reports } from "@/db/schema";

export type ImproveAiCriterion = {
  index: number;
  answerKey: string;
  criterionKey: string;
  label: string;
  description: string;
  aiStatus: CriterionStatus;
  aiReasoning: string;
};

export type ImproveAiPreviousSection = {
  section: SectionType;
  blocks: ImproveAiDisplayBlock[];
};

export type ImproveAiSectionView = {
  section: SectionType;
  sectionIndex: number;
  /** Flat prompt text (LLM parity); UI uses `blocks` for rich preview. */
  sectionContent: string;
  blocks: ImproveAiDisplayBlock[];
  systemPrompt: string;
  previousSections: ImproveAiPreviousSection[];
  criteria: ImproveAiCriterion[];
};

export type ImproveAiSessionView = {
  id: string;
  reportId: string;
  status: (typeof aiFeedbackSessions.$inferSelect)["status"];
  sourceType: (typeof aiFeedbackSessions.$inferSelect)["sourceType"];
  sourceLabel: string;
  deviationNo: string;
  reportDate: string;
  sections: ImproveAiSectionView[];
  totalCriterionCount: number;
  answers: Record<string, HumanSubAnswerDraft>;
};

function evaluableSectionKeys(documentType: DocumentType): SectionType[] {
  return getEvaluatableSections(documentType).map((section) => section.key);
}

function priorSections(
  section: SectionType,
  ordered: readonly SectionType[]
): SectionType[] {
  const idx = ordered.indexOf(section);
  if (idx <= 0) return [];
  return ordered.slice(0, idx);
}

function previousSectionsForView(
  section: SectionType,
  allSections: AllSectionsContent,
  ordered: readonly SectionType[]
): ImproveAiPreviousSection[] {
  return priorSections(section, ordered).flatMap((priorSection) => {
    const content = allSections[priorSection];
    if (!content) return [];
    const blocks = buildSectionDisplayBlocks(priorSection, content);
    if (!sectionDisplayBlocksHaveContent(blocks)) return [];
    return [{ section: priorSection, blocks }];
  });
}

function contentForSection(
  section: SectionType,
  report: typeof reports.$inferSelect,
  sectionContents: AllSectionsContent
): unknown {
  if (section === "cover_page") return report.metadata;
  return sectionContents[section];
}

export function buildImproveAiSessionView(params: {
  session: typeof aiFeedbackSessions.$inferSelect;
  report: typeof reports.$inferSelect;
  sectionContents: AllSectionsContent;
  responses: (typeof aiFeedbackResponses.$inferSelect)[];
}): ImproveAiSessionView {
  const documentType = params.report.documentType;
  const orderedSections = evaluableSectionKeys(documentType);
  const evalByKey = new Map(
    params.responses.map((r) => [r.criterionKey, r])
  );

  const sections: ImproveAiSectionView[] = [];

  for (const section of orderedSections) {
    const content = contentForSection(
      section,
      params.report,
      params.sectionContents
    );
    const blocks = buildSectionDisplayBlocks(section, content);
    if (!sectionDisplayBlocksHaveContent(blocks)) continue;
    const sectionContent = blocksToPromptText(blocks);

    const defs = getCriteria(documentType, section);
    const criteria: ImproveAiCriterion[] = [];

    for (let i = 0; i < defs.length; i++) {
      const def = defs[i]!;
      const row = evalByKey.get(def.key);
      if (!row) continue;
      criteria.push({
        index: i + 1,
        answerKey: humanAnswerKey(section, def.key),
        criterionKey: def.key,
        label: def.label,
        description: def.description,
        aiStatus: row.aiStatus,
        aiReasoning: row.aiReasoning,
      });
    }

    if (criteria.length === 0) continue;

    sections.push({
      section,
      sectionIndex: sections.length + 1,
      sectionContent,
      blocks,
      systemPrompt: buildEvaluationSystemPromptForType(documentType, section),
      previousSections: previousSectionsForView(
        section,
        params.sectionContents,
        orderedSections
      ),
      criteria,
    });
  }

  const answers: Record<string, HumanSubAnswerDraft> = {};
  for (const section of sections) {
    for (const criterion of section.criteria) {
      const row = evalByKey.get(criterion.criterionKey);
      answers[criterion.answerKey] = {
        section: section.section,
        criterionKey: criterion.criterionKey,
        criteriaEvaluationAgreement:
          (row?.criteriaEvaluationAgreement as HumanSubAnswerDraft["criteriaEvaluationAgreement"]) ??
          undefined,
        reasoningAgreement:
          (row?.reasoningAgreement as HumanSubAnswerDraft["reasoningAgreement"]) ??
          undefined,
        comment: row?.humanComment ?? "",
        suggestedStatus: row?.suggestedStatus ?? null,
      };
    }
  }

  const totalCriterionCount = sections.reduce(
    (sum, s) => sum + s.criteria.length,
    0
  );

  return {
    id: params.session.id,
    reportId: params.session.reportId,
    status: params.session.status,
    sourceType: params.session.sourceType,
    sourceLabel: params.session.sourceLabel,
    deviationNo: params.report.documentNo,
    reportDate: params.report.date.toISOString(),
    sections,
    totalCriterionCount,
    answers,
  };
}

export function improveAiAnswerKeys(view: ImproveAiSessionView): string[] {
  return view.sections.flatMap((section) =>
    section.criteria.map((c) => c.answerKey)
  );
}

export function improveAiReviewProgress(view: ImproveAiSessionView): {
  answered: number;
  total: number;
} {
  const keys = improveAiAnswerKeys(view);
  const answered = keys.filter((key) => {
    const answer = view.answers[key];
    return answer?.criteriaEvaluationAgreement && answer.reasoningAgreement;
  }).length;
  return { answered, total: keys.length };
}
