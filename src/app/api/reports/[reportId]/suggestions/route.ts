import { NextResponse } from "next/server";
import { after } from "next/server";
import { propagateAttributes } from "@langfuse/tracing";
import { and, eq, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { db } from "@/db";
import {
  reports,
  reportSections,
  criteriaEvaluations,
  comments,
  sectionTypeEnum,
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
  canLocateEditInPlainText,
  type SuggestionEdit,
} from "@/lib/tiptap/suggestion-inject";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";
import { mergeSection } from "@/lib/sections-merge";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { normalizeSuggestionInsertText } from "@/lib/placeholders/normalize-suggestion-insert";
import { normalizeCommentRecord } from "@/lib/comments/normalize";
import {
  flushLangfuseTraces,
  isLangfuseEnabled,
  observeRouteHandler,
  setRouteObservationIO,
} from "@/lib/observability/langfuse";

export const maxDuration = 120;

const bodySchema = z.object({
  section: z.string(),
});

function isValidSection(v: string): v is SectionType {
  return (sectionTypeEnum.enumValues as readonly string[]).includes(v);
}

export const POST = observeRouteHandler(
  "report-suggest-edits",
  handleSuggestionsPost
);

async function handleSuggestionsPost(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (!isValidSection(parsed.data.section)) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  }
  const section = parsed.data.section;

  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  const sectionContent = mergeSection(section, sectionRow.content);
  const gap = gapCriteriaForSection(
    section,
    evaluations.map((e) => ({
      ...e,
      updatedAt: e.updatedAt.toISOString(),
    })),
    commentRows.map((c) => normalizeCommentRecord(c)),
    sectionContent
  );

  if (gap.length === 0) {
    return NextResponse.json(
      { blocked: true, reason: "no_gap_criteria" },
      { status: 409 }
    );
  }

  const hash = sectionContentHash(section, sectionContent);
  const suggestionContentHash = hash;
  const stale = gap.some((g) => g.evaluatedContentHash && g.evaluatedContentHash !== hash);
  if (stale) {
    return NextResponse.json(
      { blocked: true, reason: "stale_evaluation" },
      { status: 409 }
    );
  }

  const runSuggestions = async (): Promise<Response> => {
  const allSectionRows = await db
    .select()
    .from(reportSections)
    .where(eq(reportSections.reportId, reportId));
  const allSections: AllSectionsContent = {};
  for (const row of allSectionRows) {
    allSections[row.section] = mergeSection(row.section, row.content);
  }

  const { suggestions: llmSuggestions, dropped: llmDropped } =
    await generateSuggestionsForSection({
      section,
      content: sectionContent,
      reportContext: { deviationNo: report.deviationNo, date: report.date },
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
    const plain = richJsonToPlainText(fieldDoc, { tableFormat: "markdown" });
    const edit: SuggestionEdit = {
      anchorText: s.anchorText,
      deleteText: s.deleteText,
      insertText: s.insertText,
    };
    const loc = canLocateEditInPlainText(plain, edit);
    if (!loc.ok) {
      dropped.push({
        criterionKey: s.criterionKey,
        reason: loc.reason === "ambiguous" ? ("ambiguous" as const) : ("not_found" as const),
      });
      continue;
    }

    const suggestionId = createId();
    const insertText = normalizeSuggestionInsertText(s.insertText);

    const payload: ParsedAiFixPayload = {
      deleteText: s.deleteText,
      insertText,
      reasoning: s.reasoning,
      contentHashAtSuggestion: suggestionContentHash,
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
    const edit: SuggestionEdit = {
      anchorText: s.anchorText,
      deleteText: s.deleteText,
      insertText,
    };
    const loc = canLocateEditInPlainText(fieldPlain, edit);
    if (!loc.ok) {
      dropped.push({
        criterionKey: s.criterionKey,
        reason: loc.reason === "ambiguous" ? "ambiguous" : "not_found",
      });
      continue;
    }

    const suggestionId = createId();
    const payload: ParsedAiFixPayload = {
      deleteText: s.deleteText,
      insertText,
      reasoning: s.reasoning,
      contentHashAtSuggestion: suggestionContentHash,
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

  if (applied.length > 0) {
    await db
      .update(reportSections)
      .set({ content: workingContent, updatedAt: new Date() })
      .where(eq(reportSections.id, sectionRow.id));
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
      deviationNo: report.deviationNo,
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
        deviationNo: report.deviationNo,
      },
    },
    runSuggestions
  );
}
