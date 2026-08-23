import { NextResponse } from "next/server";
import { after } from "next/server";
import { propagateAttributes } from "@langfuse/tracing";
import { and, eq, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { db } from "@/db";
import {
  reportSections,
  criteriaEvaluations,
  comments,
} from "@/db/schema";
import type { SectionType } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { generateSuggestionsForSection } from "@/lib/ai/suggest";
import { AI_AUTHOR_ID } from "@/lib/ai/constants";
import {
  sectionContentHash,
  gapCriteriaForSection,
} from "@/lib/ai/suggestion-gating";
import { effectiveStatus } from "@/lib/ai/criteria-view";
import {
  serializeAiFixCommentContent,
  type ParsedAiFixPayload,
} from "@/lib/ai/suggestion-gating";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import type { AllSectionsContent } from "@/lib/ai/evaluate";
import {
  isApplyableStatus,
  probePlainEdit,
  probeRichEdit,
  type LocateStatus,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";
import type { SuggestionDropReason } from "@/lib/ai/suggest";
import { mergeSectionForType } from "@/lib/document-types";
import { isValidSection } from "@/lib/document-types";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import { normalizeCommentRecord } from "@/lib/comments/normalize";
import {
  flushLangfuseTraces,
  isLangfuseEnabled,
  observeRouteHandler,
  setRouteObservationIO,
} from "@/lib/observability/langfuse";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { canSaveReportSection } from "@/lib/reports/access";

export const maxDuration = 120;

/** Map a non-applyable probe status to a drop reason (kept distinct for telemetry). */
function dropReasonForProbe(status: LocateStatus): SuggestionDropReason {
  switch (status) {
    case "ambiguous":
      return "ambiguous";
    case "cross_cell":
      return "cross_cell";
    case "bad_scope":
      return "bad_scope";
    default:
      return "not_found";
  }
}

const bodySchema = z.object({
  section: z.string(),
});

export const POST = observeRouteHandler(
  "report-suggest-edits",
  handleSuggestionsPost
);

async function handleSuggestionsPost(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const currentUser = await getCurrentUser();
  const { reportId } = await params;
  const access = await requireReportAccess(reportId, currentUser);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { report, user } = access;

  if (!canSaveReportSection(user, report)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (!isValidSection(report.documentType, parsed.data.section)) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  }
  const section = parsed.data.section;

  const [sectionRow] = await db
    .select()
    .from(reportSections)
    .where(and(eq(reportSections.reportId, reportId), eq(reportSections.section, section)));
  if (!sectionRow) return NextResponse.json({ error: "Section not found" }, { status: 404 });

  const evaluations = await db
    .select()
    .from(criteriaEvaluations)
    .where(eq(criteriaEvaluations.reportId, reportId));

  const commentRows = await db
    .select()
    .from(comments)
    .where(eq(comments.reportId, reportId));

  const allSectionRows = await db
    .select()
    .from(reportSections)
    .where(eq(reportSections.reportId, reportId));
  const allSections: AllSectionsContent = {};
  for (const row of allSectionRows) {
    allSections[row.section] = mergeSectionForType(
      report.documentType,
      row.section,
      row.content
    );
  }

  // Cover page criteria hash report.metadata (same as evaluate), not empty section JSON.
  const sectionContent =
    section === "cover_page"
      ? report.metadata
      : (allSections[section] ??
        mergeSectionForType(report.documentType, section, sectionRow.content));

  const gap = gapCriteriaForSection(
    section,
    evaluations.map((e) => ({
      ...e,
      updatedAt: e.updatedAt.toISOString(),
    })),
    commentRows.map((c) => normalizeCommentRecord(c)),
    sectionContent,
    report.documentType,
    allSections
  );

  const hash = sectionContentHash(section, sectionContent, {
    documentType: report.documentType,
    allSections,
  });
  // Suggestion staleness is section-local (validateSuggestionLocate has no allSections).
  const suggestionContentHash = sectionContentHash(section, sectionContent, {
    documentType: report.documentType,
  });
  const stale = gap.some((g) => g.evaluatedContentHash && g.evaluatedContentHash !== hash);
  const blockedReason =
    gap.length === 0 ? "no_gap_criteria" : stale ? "stale_evaluation" : null;

  const runSuggestions = async (): Promise<Response> => {
    if (blockedReason) {
      setRouteObservationIO({
        output: {
          reportId,
          section,
          blocked: true,
          reason: blockedReason,
          gapCriterionCount: gap.length,
        },
      });
      return NextResponse.json(
        { blocked: true, reason: blockedReason },
        { status: 409 }
      );
    }

  const { suggestions: llmSuggestions, dropped: llmDropped } =
    await generateSuggestionsForSection({
      section,
      content: sectionContent,
      reportContext: { deviationNo: report.documentNo, date: report.date },
      reportId,
      allSections,
      gapCriteria: gap.map((g) => ({
        criterionKey: g.criterionKey,
        criterionLabel: g.criterionLabel,
        reasoning: g.reasoning,
        evaluationId: g.id,
        status: effectiveStatus(g),
      })),
    });

  const applied: Array<{
    suggestionId: string;
    criterionKey: string;
    evaluationId: string;
    targetField: string;
  }> = [];
  const dropped = [...llmDropped];

  const workingContent = sectionContent as Record<string, unknown>;

  const richSuggestions = llmSuggestions.filter((s) =>
    isRichTargetField(section, s.targetField)
  );
  const structuredSuggestions = llmSuggestions.filter(
    (s) => !isRichTargetField(section, s.targetField)
  );

  for (const s of richSuggestions) {
    const fieldDoc = getRichFieldValue(workingContent, s.targetField);
    const edit: SuggestionEdit = {
      anchorText: s.anchorText,
      deleteText: s.deleteText,
      insertText: s.insertText,
      scope: s.scope,
      second: s.second,
    };
    const status = probeRichEdit(fieldDoc, edit);
    if (!isApplyableStatus(status)) {
      dropped.push({
        criterionKey: s.criterionKey,
        reason: dropReasonForProbe(status),
      });
      continue;
    }

    const suggestionId = createId();
    const insertText = normalizeSuggestionInsertText(s.insertText);
    const second = s.second
      ? {
          ...s.second,
          insertText: normalizeSuggestionInsertText(s.second.insertText),
        }
      : undefined;

    const payload: ParsedAiFixPayload = {
      deleteText: s.deleteText,
      insertText,
      reasoning: s.reasoning,
      scope: s.scope,
      second,
      contentHashAtSuggestion: suggestionContentHash,
      evidenceSources: s.evidenceSources,
    };

    await db.insert(comments).values({
      id: suggestionId,
      reportId,
      sectionId: sectionRow.id,
      section,
      authorId: AI_AUTHOR_ID,
      content: serializeAiFixCommentContent(payload),
      anchorText: s.anchorText,
      contentPath: s.targetField,
      fromPos: null,
      toPos: null,
      status: "open",
      kind: "ai_fix",
      evaluationId: s.evaluationId,
    });

    applied.push({
      suggestionId,
      criterionKey: s.criterionKey,
      evaluationId: s.evaluationId,
      targetField: s.targetField,
    });
  }

  for (const s of structuredSuggestions) {
    const fieldPlain = getPlainTextFieldValue(workingContent, s.targetField);
    const insertText = normalizeSuggestionInsertText(s.insertText);
    const second = s.second
      ? {
          ...s.second,
          insertText: normalizeSuggestionInsertText(s.second.insertText),
        }
      : undefined;
    const edit: SuggestionEdit = {
      anchorText: s.anchorText,
      deleteText: s.deleteText,
      insertText,
      second,
    };
    const status = probePlainEdit(fieldPlain, edit);
    if (!isApplyableStatus(status)) {
      dropped.push({
        criterionKey: s.criterionKey,
        reason: dropReasonForProbe(status),
      });
      continue;
    }

    const suggestionId = createId();
    const payload: ParsedAiFixPayload = {
      deleteText: s.deleteText,
      insertText,
      reasoning: s.reasoning,
      second,
      contentHashAtSuggestion: suggestionContentHash,
      evidenceSources: s.evidenceSources,
    };

    await db.insert(comments).values({
      id: suggestionId,
      reportId,
      sectionId: sectionRow.id,
      section,
      authorId: AI_AUTHOR_ID,
      content: serializeAiFixCommentContent(payload),
      anchorText: s.anchorText,
      contentPath: s.targetField,
      fromPos: null,
      toPos: null,
      status: "open",
      kind: "ai_fix",
      evaluationId: s.evaluationId,
    });

    applied.push({
      suggestionId,
      criterionKey: s.criterionKey,
      evaluationId: s.evaluationId,
      targetField: s.targetField,
    });
  }

  // Generation only creates open ai_fix comments — the document is untouched
  // until a human accepts one (which records suggestion_applied).
  if (applied.length > 0 || dropped.length > 0) {
    await recordAuditEvent({
      actor: auditActorFromUser(user),
      action: "suggestion_generated",
      entityType: "suggestion",
      entityId: sectionRow.id,
      reportId,
      summary: `Generated ${applied.length} AI suggestion(s) for ${section}${dropped.length > 0 ? ` (${dropped.length} dropped)` : ""}`,
      newValue: {
        generatedCount: applied.length,
        droppedCount: dropped.length,
        criteria: applied.map((a) => a.criterionKey),
      },
    });
  }

  const updatedComments = await db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.reportId, reportId),
        inArray(
          comments.id,
          applied.map((a) => a.suggestionId)
        )
      )
    );

    setRouteObservationIO({
      output: {
        reportId,
        section,
        appliedCount: applied.length,
        droppedCount: dropped.length,
        appliedCriteria: applied.map((a) => a.criterionKey),
        droppedCriteria: dropped.map((d) => ({
          criterionKey: d.criterionKey,
          reason: d.reason,
        })),
      },
    });

  return NextResponse.json({
    section,
    applied,
    dropped,
    updatedContent: workingContent,
    newComments: updatedComments,
  });
  };

  if (!isLangfuseEnabled()) return runSuggestions();

  setRouteObservationIO({
    input: {
      reportId,
      section,
      documentNo: report.documentNo,
      gapCriterionCount: gap.length,
      gapCriteria: gap.map((g) => g.criterionKey),
    },
  });
  after(flushLangfuseTraces);

  return propagateAttributes(
    {
      sessionId: reportId,
      userId: user.id,
      traceName: "report-suggest-edits",
      tags: ["suggestion-generation"],
      metadata: {
        feature: "suggestion-generation",
        section,
        documentNo: report.documentNo,
      },
    },
    runSuggestions
  );
}
