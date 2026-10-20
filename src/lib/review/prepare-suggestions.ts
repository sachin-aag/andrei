import type { CriterionStatus, SectionType } from "@/db/schema";
import { generateSuggestionsForSection } from "@/lib/ai/suggest";
import { mergeSectionForType } from "@/lib/document-types";
import { draftEditForFinding } from "./draft-fix";
import { mapPool } from "./map-pool";
import { persistLocatedEdit, persistRedraftComment } from "./persist-suggestion";
import { proposedEditFromMetadata } from "./proposed-edit";
import type { ReviewFindingDraft, ReviewRunContext } from "./types";

/** Drafting is one model call per finding; past this a finding needs a human. */
export const MAX_DRAFTS_PER_CHECK = 40;
const DRAFT_CONCURRENCY = 4;

export type CriterionGap = {
  criterionKey: string;
  criterionLabel: string;
  reasoning: string;
  evaluationId: string;
  status: CriterionStatus;
};

/**
 * One AI Check pass for the section's failing criteria, saved as suggestion
 * comments. Held comments carry no evaluationId so the document queue keeps
 * them hidden until Apply. Returns evaluationId → commentId.
 */
export async function criterionSuggestionComments(args: {
  ctx: ReviewRunContext;
  section: string;
  gaps: CriterionGap[];
  held: boolean;
}): Promise<Map<string, string>> {
  const { ctx, section } = args;
  const out = new Map<string, string>();
  if (args.gaps.length === 0) return out;
  const sectionContent =
    section === "cover_page"
      ? ctx.report.metadata
      : (ctx.sections[section] ??
        mergeSectionForType(ctx.documentType, section, {}));
  const { suggestions } = await generateSuggestionsForSection({
    section: section as SectionType,
    content: sectionContent,
    reportContext: {
      deviationNo: ctx.report.documentNo,
      date: ctx.report.date,
    },
    reportId: ctx.report.id,
    documentType: ctx.documentType,
    allSections: ctx.sections,
    gapCriteria: args.gaps,
  });
  for (const suggestion of suggestions) {
    if (out.has(suggestion.evaluationId)) continue;
    const evaluationId = args.held ? null : suggestion.evaluationId;
    const commentId = suggestion.redraftMarkdown?.trim()
      ? await persistRedraftComment({
          ctx,
          section,
          contentPath: suggestion.targetField,
          markdown: suggestion.redraftMarkdown.trim(),
          reasoning: suggestion.reasoning,
          evaluationId,
          releasedToQueue: !args.held,
        })
      : (
          await persistLocatedEdit({
            ctx,
            section,
            contentPath: suggestion.targetField,
            edit: {
              anchorText: suggestion.anchorText,
              deleteText: suggestion.deleteText,
              insertText: suggestion.insertText,
              scope: suggestion.scope,
              second: suggestion.second,
            },
            reasoning: suggestion.reasoning,
            kind: "ai_fix",
            evaluationId,
            releasedToQueue: !args.held,
          })
        )?.commentId ?? null;
    if (commentId) out.set(suggestion.evaluationId, commentId);
  }
  return out;
}

function criterionGap(finding: ReviewFindingDraft): CriterionGap | null {
  const metadata = finding.metadata ?? {};
  const { criterionKey, evaluationId } = metadata;
  if (typeof criterionKey !== "string" || typeof evaluationId !== "string") {
    return null;
  }
  const label =
    typeof metadata.criterionLabel === "string" ? metadata.criterionLabel : criterionKey;
  return {
    criterionKey,
    criterionLabel: label,
    reasoning: finding.message,
    evaluationId,
    status: finding.severity === "critical" ? "not_met" : "partially_met",
  };
}

/**
 * Give every new finding its suggestion while the check runs, so Apply only
 * places it. Findings that end up with neither a comment nor a proposedEdit
 * need a human. Drafting failures never fail the run.
 */
export async function prepareFindingSuggestions(args: {
  ctx: ReviewRunContext;
  checkId: string;
  findings: ReviewFindingDraft[];
}): Promise<ReviewFindingDraft[]> {
  const { ctx, checkId } = args;
  const findings = args.findings.map((finding) => ({
    ...finding,
    metadata: { ...(finding.metadata ?? {}) },
  }));

  const criterionBySection = new Map<string, ReviewFindingDraft[]>();
  const toDraft: ReviewFindingDraft[] = [];
  for (const finding of findings) {
    if (finding.commentId || proposedEditFromMetadata(finding.metadata)) continue;
    if (!finding.section) continue;
    if (criterionGap(finding)) {
      const list = criterionBySection.get(finding.section) ?? [];
      list.push(finding);
      criterionBySection.set(finding.section, list);
    } else if (finding.contentPath) {
      toDraft.push(finding);
    }
  }

  for (const [section, group] of criterionBySection) {
    try {
      const comments = await criterionSuggestionComments({
        ctx,
        section,
        gaps: group.flatMap((finding) => criterionGap(finding) ?? []),
        held: true,
      });
      for (const finding of group) {
        const commentId = comments.get(String(finding.metadata?.evaluationId));
        if (!commentId) continue;
        finding.commentId = commentId;
        finding.kind = "fixable";
      }
    } catch {
      // Left without a suggestion: the card asks for human review.
    }
  }

  await mapPool(toDraft.slice(0, MAX_DRAFTS_PER_CHECK), DRAFT_CONCURRENCY, async (finding) => {
    try {
      const edit = await draftEditForFinding({
        ctx,
        finding: {
          checkId,
          section: finding.section!,
          contentPath: finding.contentPath!,
          anchorText: finding.anchorText,
          message: finding.message,
          severity: finding.severity,
          metadata: finding.metadata ?? {},
        },
      });
      if (!edit) return;
      finding.kind = "fixable";
      finding.metadata = { ...finding.metadata, proposedEdit: edit };
    } catch {
      // Left without a suggestion: the card asks for human review.
    }
  });

  return findings;
}
