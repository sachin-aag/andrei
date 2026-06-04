import type { SectionType, CriterionStatus } from "@/db/schema";
import { getCriteria, EVALUATABLE_SECTIONS } from "@/lib/ai/criteria";
import { contextForPrompt } from "@/lib/ai/section-context";
import { buildEvaluationSystemPrompt } from "@/lib/ai/section-prompts";
import type { AllSectionsContent } from "@/lib/ai/evaluate";
import { EDITABLE_SECTIONS } from "@/types/sections";
import {
  humanAnswerKey,
  REVIEWABLE_SECTION_TYPES,
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
  content: string;
};

export type ImproveAiSectionView = {
  section: SectionType;
  sectionIndex: number;
  sectionContent: string;
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

function formatSectionContent(section: SectionType, content: unknown): string {
  return typeof content === "string" ? content : contextForPrompt(section, content);
}

function priorSections(section: SectionType): SectionType[] {
  const idx = EDITABLE_SECTIONS.indexOf(section as (typeof EDITABLE_SECTIONS)[number]);
  if (idx <= 0) return [];
  return EDITABLE_SECTIONS.slice(0, idx) as unknown as SectionType[];
}

function previousSectionsForView(
  section: SectionType,
  allSections: AllSectionsContent
): ImproveAiPreviousSection[] {
  return priorSections(section).flatMap((priorSection) => {
    const content = allSections[priorSection];
    if (!content) return [];
    const formatted = formatSectionContent(priorSection, content);
    if (!formatted.trim() || formatted === "{}") return [];
    return [{ section: priorSection, content: formatted }];
  });
}

export function buildImproveAiSessionView(params: {
  session: typeof aiFeedbackSessions.$inferSelect;
  report: typeof reports.$inferSelect;
  sectionContents: AllSectionsContent;
  responses: (typeof aiFeedbackResponses.$inferSelect)[];
}): ImproveAiSessionView | null {
  const evalByKey = new Map(
    params.responses.map((r) => [r.criterionKey, r])
  );

  const sections: ImproveAiSectionView[] = [];

  for (const section of EVALUATABLE_SECTIONS) {
    const content = params.sectionContents[section];
    const sectionContent = formatSectionContent(section, content);
    if (!sectionContent.trim() || sectionContent === "{}") continue;

    const defs = getCriteria(section);
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
      systemPrompt: buildEvaluationSystemPrompt(section),
      previousSections: previousSectionsForView(section, params.sectionContents),
      criteria,
    });
  }

  if (sections.length === 0) return null;

  const answers: Record<string, HumanSubAnswerDraft> = {};
  for (const section of sections) {
    for (const criterion of section.criteria) {
      const row = evalByKey.get(criterion.criterionKey);
      answers[criterion.answerKey] = {
        section: section.section as (typeof REVIEWABLE_SECTION_TYPES)[number],
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
    deviationNo: params.report.deviationNo,
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
