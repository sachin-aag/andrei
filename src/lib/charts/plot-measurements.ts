import { and, eq, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import type { JSONContent } from "@tiptap/core";
import { db } from "@/db";
import { comments, reportSections } from "@/db/schema";
import type { DocumentType, SectionType } from "@/db/schema";
import { AI_AUTHOR_ID } from "@/lib/ai/constants";
import {
  parseAiFixCommentContent,
  serializeAiFixCommentContent,
  sectionContentHash,
} from "@/lib/ai/suggestion-gating";
import {
  isRichTargetField,
  resolveTargetField,
} from "@/lib/ai/suggest-target-fields";
import {
  chatTargetFields,
  isChatEditableSection,
  sectionFieldPlainText,
} from "@/lib/ai/chat/fields";
import { checkProposedEdit, proposedEditHint } from "@/lib/ai/chat/propose-edit";
import {
  commitChatEdit,
  type TurnEditItem,
} from "@/lib/ai/chat/commit-edit";
import type { ChatEditPolicy } from "@/lib/ai/chat/edit-policy";
import type { AuditActorSnapshot } from "@/lib/audit";
import type { RetrievalPolicy } from "@/lib/ai/chat/retrieval-policy";
import type { DocumentReviewSession } from "@/lib/ai/chat/document-review";
import {
  countImagesInDoc,
  MAX_IMAGES_PER_SECTION,
} from "@/lib/images/compress-image";
import { mergeSection } from "@/lib/sections-merge";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import {
  listInlineImagesInDoc,
  type ListedInlineImage,
  type SuggestionImageInsert,
  type SuggestionImageRemove,
} from "@/lib/suggestions/image-insert";
import {
  DEFAULT_CHART_LAYOUT,
  layoutPoints,
  mergeChartLayout,
  parseChartSpec,
  splitSpec,
  type ChartLayout,
  type ChartSpec,
} from "@/lib/charts/chart-spec";
import {
  extractMeasurements,
  buildChartSpec,
  type ExtractMeasurementsResult,
} from "@/lib/charts/extract-measurements";
import {
  CHART_DISPLAY_WIDTH_PX,
  renderChartPng,
  type RenderedChart,
  type RenderChartError,
} from "@/lib/charts/render-chart";

const REVIEW_INCOMPLETE_MESSAGE =
  "Finish the document review (start_document_review → continue_document_review until coverage is complete → finish_document_review) before drafting.";

export type PlotMeasurementsLayoutInput = {
  mode?: ChartLayout["mode"];
  seriesBy?: ChartLayout["seriesBy"];
  xAxis?: ChartLayout["xAxis"];
  yMax?: number;
};

export type PlotMeasurementsInput = {
  section: SectionType;
  targetField: string;
  query: string;
  title?: string;
  xLabel?: string;
  yLabel?: string;
  layout?: PlotMeasurementsLayoutInput;
  anchorText?: string;
  reasoning: string;
};

export type PlotMeasurementsResult =
  | {
      status: "proposed" | "replaced" | "applied";
      suggestionId: string;
      suggestionIds: string[];
      section: SectionType;
      targetField: string;
      summary: string;
    }
  | { status: "not_editable"; message: string }
  | { status: "invalid_section"; message: string }
  | { status: "invalid_field"; message: string; allowedFields: string[] }
  | { status: "plain_field"; message: string }
  | { status: "section_not_found"; message: string }
  | { status: "too_many_images"; message: string }
  | { status: "not_found"; message: string }
  | { status: "unverified"; message: string }
  | { status: "canvas_unavailable"; message: string }
  | { status: "too_large"; message: string }
  | { status: "not_found_anchor"; hint: string }
  | { status: "ambiguous"; hint: string }
  | { status: "cross_cell"; hint: string }
  | { status: "bad_scope"; hint: string }
  | { status: "review_incomplete"; message: string };

type LoadedSection = { sectionId: string; content: Record<string, unknown> };

export type OpenAiFixComment = {
  id: string;
  content: string;
  contentPath: string | null;
  status: string;
};

export type PlotMeasurementsDeps = {
  loadSection: (reportId: string, section: SectionType) => Promise<LoadedSection | null>;
  listOpenAiFixes: (input: {
    reportId: string;
    section: SectionType;
  }) => Promise<OpenAiFixComment[]>;
  insertComment: (values: {
    id: string;
    reportId: string;
    sectionId: string;
    section: SectionType;
    content: string;
    anchorText: string;
    contentPath: string;
  }) => Promise<void>;
  updateComment: (input: { id: string; content: string }) => Promise<void>;
  dismissComments: (ids: string[]) => Promise<void>;
  extractMeasurements: typeof extractMeasurements;
  renderChartPng: typeof renderChartPng;
  createId: () => string;
};

async function defaultLoadSection(
  reportId: string,
  section: SectionType
): Promise<LoadedSection | null> {
  const [row] = await db
    .select()
    .from(reportSections)
    .where(
      and(eq(reportSections.reportId, reportId), eq(reportSections.section, section))
    );
  if (!row) return null;
  return {
    sectionId: row.id,
    content: mergeSection(section, row.content) as Record<string, unknown>,
  };
}

async function defaultListOpenAiFixes(input: {
  reportId: string;
  section: SectionType;
}): Promise<OpenAiFixComment[]> {
  const rows = await db
    .select({
      id: comments.id,
      content: comments.content,
      contentPath: comments.contentPath,
      status: comments.status,
    })
    .from(comments)
    .where(
      and(
        eq(comments.reportId, input.reportId),
        eq(comments.section, input.section),
        eq(comments.kind, "ai_fix"),
        eq(comments.status, "open")
      )
    );
  return rows;
}

async function defaultInsertComment(values: {
  id: string;
  reportId: string;
  sectionId: string;
  section: SectionType;
  content: string;
  anchorText: string;
  contentPath: string;
}): Promise<void> {
  await db.insert(comments).values({
    id: values.id,
    reportId: values.reportId,
    sectionId: values.sectionId,
    section: values.section,
    authorId: AI_AUTHOR_ID,
    content: values.content,
    anchorText: values.anchorText,
    contentPath: values.contentPath,
    fromPos: null,
    toPos: null,
    status: "open",
    kind: "ai_fix",
    evaluationId: null,
  });
}

async function defaultUpdateComment(input: { id: string; content: string }): Promise<void> {
  await db.update(comments).set({ content: input.content }).where(eq(comments.id, input.id));
}

async function defaultDismissComments(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(comments)
    .set({ status: "dismissed" })
    .where(inArray(comments.id, ids));
}

const DEFAULT_DEPS: PlotMeasurementsDeps = {
  loadSection: defaultLoadSection,
  listOpenAiFixes: defaultListOpenAiFixes,
  insertComment: defaultInsertComment,
  updateComment: defaultUpdateComment,
  dismissComments: defaultDismissComments,
  extractMeasurements,
  renderChartPng,
  createId,
};

function shouldGatePlotOnDocumentReview(input: {
  retrievalPolicy: RetrievalPolicy;
  documentReview: DocumentReviewSession;
}): boolean {
  if (input.documentReview.phase() !== "idle" && !input.documentReview.isFinished()) {
    return true;
  }
  return input.retrievalPolicy === "comprehensive" && !input.documentReview.isFinished();
}

function insertFromRender(
  spec: ChartSpec,
  rendered: RenderedChart
): SuggestionImageInsert {
  return {
    src: rendered.dataUrl,
    alt: spec.title,
    width: CHART_DISPLAY_WIDTH_PX,
    mediaId: null,
    chartSpec: spec,
  };
}

function restyleSpec(
  existing: ChartSpec,
  input: PlotMeasurementsInput
): ChartSpec {
  const layout = mergeChartLayout(existing.layout, input.layout ?? {});
  const next: ChartSpec = {
    ...existing,
    title: input.title?.trim() || existing.title,
    xLabel: input.xLabel?.trim() || existing.xLabel,
    yLabel: input.yLabel?.trim() || existing.yLabel,
    layout,
  };
  return { ...next, points: layoutPoints(next) };
}

function pendingChartsForQuery(
  open: OpenAiFixComment[],
  query: string,
  contentPath: string
): Array<{ comment: OpenAiFixComment; spec: ChartSpec; insertImage: SuggestionImageInsert }> {
  const hits: Array<{
    comment: OpenAiFixComment;
    spec: ChartSpec;
    insertImage: SuggestionImageInsert;
  }> = [];
  for (const comment of open) {
    if ((comment.contentPath ?? "") !== contentPath) continue;
    const parsed = parseAiFixCommentContent(comment.content);
    const spec = parseChartSpec(parsed.insertImage?.chartSpec);
    if (!spec || spec.query !== query || !parsed.insertImage) continue;
    hits.push({ comment, spec, insertImage: parsed.insertImage });
  }
  return hits;
}

function acceptedChartsForQuery(
  images: ListedInlineImage[],
  query: string
): ListedInlineImage[] {
  return images.filter((image) => image.chartSpec?.query === query);
}

async function renderSpecs(
  specs: ChartSpec[],
  render: typeof renderChartPng
): Promise<
  | { ok: true; rendered: Array<{ spec: ChartSpec; png: RenderedChart }> }
  | { ok: false; error: RenderChartError }
> {
  const rendered: Array<{ spec: ChartSpec; png: RenderedChart }> = [];
  for (const spec of specs) {
    const png = await render(spec);
    if ("error" in png) return { ok: false, error: png };
    rendered.push({ spec, png });
  }
  return { ok: true, rendered };
}

function renderErrorResult(error: RenderChartError): PlotMeasurementsResult {
  if (error.error === "canvas_unavailable") {
    return {
      status: "canvas_unavailable",
      message: "Chart rendering is unavailable in this environment.",
    };
  }
  return {
    status: "too_large",
    message: "The rendered chart exceeds the inline image size cap.",
  };
}

function checkStatusResult(
  check: ReturnType<typeof checkProposedEdit>,
  fieldDoc: JSONContent | null,
  anchorText: string
): PlotMeasurementsResult | null {
  if (check.status === "ok") return null;
  if (check.status === "too_large") {
    return { status: "too_large", message: "The proposed chart edit is too large for this field." };
  }
  const hint = proposedEditHint(check, { anchorText, fieldDoc });
  if (check.status === "not_found") {
    return { status: "not_found_anchor", hint };
  }
  return { status: check.status, hint } as PlotMeasurementsResult;
}

async function persistChartEdit(args: {
  ctx: {
    reportId: string;
    documentType: DocumentType;
    editPolicy?: ChatEditPolicy;
    actor?: AuditActorSnapshot;
    turnEdits?: TurnEditItem[];
  };
  deps: PlotMeasurementsDeps;
  loaded: LoadedSection;
  input: PlotMeasurementsInput;
  resolvedField: string;
  hash: string;
  insertImage?: SuggestionImageInsert;
  removeImage?: SuggestionImageRemove;
  anchorText: string;
}): Promise<{ ok: true; id: string } | PlotMeasurementsResult> {
  if (args.ctx.editPolicy === "commit") {
    if (!args.ctx.actor) {
      return {
        status: "not_editable",
        message:
          "This report is not editable in its current state, so charts cannot be applied.",
      };
    }
    const result = await commitChatEdit({
      reportId: args.ctx.reportId,
      actor: args.ctx.actor,
      documentType: args.ctx.documentType,
      section: args.input.section,
      targetField: args.resolvedField,
      reasoning: args.input.reasoning,
      input: {
        kind: "located",
        edit: {
          anchorText: args.anchorText,
          deleteText: "",
          insertText: "",
          insertImage: args.insertImage,
          removeImage: args.removeImage,
        },
      },
    });
    if (result.status === "applied") {
      args.ctx.turnEdits?.push({
        section: result.section,
        targetField: result.targetField,
        reasoning: args.input.reasoning,
      });
      return { ok: true, id: "applied" };
    }
    if (result.status === "section_not_found") {
      return { status: "section_not_found", message: result.message };
    }
    if (result.status === "not_found") {
      return {
        status: "not_found_anchor",
        hint: result.hint ?? "Could not place this chart.",
      };
    }
    return {
      status: result.status,
      hint: result.hint ?? "Could not apply this chart.",
    } as PlotMeasurementsResult;
  }

  const id = args.deps.createId();
  await args.deps.insertComment({
    id,
    reportId: args.ctx.reportId,
    sectionId: args.loaded.sectionId,
    section: args.input.section,
    content: serializeAiFixCommentContent({
      deleteText: "",
      insertText: "",
      insertImage: args.insertImage,
      removeImage: args.removeImage,
      reasoning: args.input.reasoning,
      contentHashAtSuggestion: args.hash,
    }),
    anchorText: args.anchorText,
    contentPath: args.resolvedField,
  });
  return { ok: true, id };
}

export async function executePlotMeasurements(
  input: PlotMeasurementsInput,
  ctx: {
    reportId: string;
    canEdit: boolean;
    documentType: DocumentType;
    retrievalPolicy: RetrievalPolicy;
    documentReview: DocumentReviewSession;
    editPolicy?: ChatEditPolicy;
    actor?: AuditActorSnapshot;
    turnEdits?: TurnEditItem[];
  },
  deps: PlotMeasurementsDeps = DEFAULT_DEPS
): Promise<PlotMeasurementsResult> {
  if (!ctx.canEdit) {
    return {
      status: "not_editable",
      message: "This report is not editable in its current state, so charts cannot be proposed.",
    };
  }
  if (
    shouldGatePlotOnDocumentReview({
      retrievalPolicy: ctx.retrievalPolicy,
      documentReview: ctx.documentReview,
    })
  ) {
    return { status: "review_incomplete", message: REVIEW_INCOMPLETE_MESSAGE };
  }
  if (!isChatEditableSection(input.section, ctx.documentType)) {
    return { status: "invalid_section", message: `Unknown section '${input.section}'.` };
  }
  const resolvedField = resolveTargetField(input.section, input.targetField);
  if (!resolvedField) {
    return {
      status: "invalid_field",
      message: `'${input.targetField}' is not an editable field of ${input.section}.`,
      allowedFields: chatTargetFields(input.section).map((f) => f.targetField),
    };
  }
  if (!isRichTargetField(input.section, resolvedField)) {
    return {
      status: "plain_field",
      message: `'${resolvedField}' is a plain-text field and cannot hold a chart. Insert into a rich narrative field instead.`,
    };
  }

  const loaded = await deps.loadSection(ctx.reportId, input.section);
  if (!loaded) {
    return { status: "section_not_found", message: "Section not found." };
  }

  const query = input.query.replace(/\s+/g, " ").trim();
  const fieldDoc = getRichFieldValue(loaded.content, resolvedField);
  const fieldText = sectionFieldPlainText(loaded.content, input.section, resolvedField);
  const listed = listInlineImagesInDoc(fieldDoc);
  const open = await deps.listOpenAiFixes({
    reportId: ctx.reportId,
    section: input.section,
  });
  const pending =
    ctx.editPolicy === "commit"
      ? []
      : pendingChartsForQuery(open, query, resolvedField);
  const accepted = acceptedChartsForQuery(listed, query);

  let specs: ChartSpec[];
  let mode: "extract" | "pending-restyle" | "accepted-restyle";
  if (pending.length > 0) {
    mode = "pending-restyle";
    specs = splitSpec(restyleSpec(pending[0]!.spec, input));
  } else if (accepted.length > 0 && accepted[0]!.chartSpec) {
    mode = "accepted-restyle";
    specs = splitSpec(restyleSpec(accepted[0]!.chartSpec, input));
  } else {
    mode = "extract";
    const extracted: ExtractMeasurementsResult = await deps.extractMeasurements({
      reportId: ctx.reportId,
      query,
    });
    if (extracted.status === "not_found") {
      return { status: "not_found", message: extracted.message };
    }
    if (extracted.status === "unverified") {
      return { status: "unverified", message: extracted.message };
    }
    const layout = mergeChartLayout(DEFAULT_CHART_LAYOUT, input.layout ?? {});
    const title = input.title?.trim() || query;
    const xLabel = input.xLabel?.trim() || "Measurement";
    const yLabel = input.yLabel?.trim() || `Value (${extracted.uom})`;
    const combined = buildChartSpec({
      query,
      title,
      xLabel,
      yLabel,
      layout,
      extraction: extracted,
    });
    specs = splitSpec(combined);
  }

  const extraCharts = Math.max(0, specs.length - (mode === "extract" ? 0 : 1));
  if (countImagesInDoc(fieldDoc) + extraCharts > MAX_IMAGES_PER_SECTION) {
    return {
      status: "too_many_images",
      message: `This field already has ${MAX_IMAGES_PER_SECTION} images (the maximum). Remove one before inserting another.`,
    };
  }

  const rendered = await renderSpecs(specs, deps.renderChartPng);
  if (!rendered.ok) return renderErrorResult(rendered.error);

  const hash = sectionContentHash(input.section, loaded.content, {
    documentType: ctx.documentType,
  });
  const anchorText = input.anchorText ?? "";

  if (mode === "pending-restyle") {
    const suggestionIds: string[] = [];
    for (let i = 0; i < rendered.rendered.length; i++) {
      const { spec, png } = rendered.rendered[i]!;
      const existing = pending[i];
      const insertImage = insertFromRender(spec, png);
      const removeImage = existing
        ? parseAiFixCommentContent(existing.comment.content).removeImage
        : undefined;
      const check = checkProposedEdit(
        fieldText,
        {
          anchorText,
          deleteText: "",
          insertText: "",
          insertImage,
          removeImage,
        },
        fieldDoc
      );
      const failed = checkStatusResult(check, fieldDoc, anchorText);
      if (failed) return failed;
      const content = serializeAiFixCommentContent({
        deleteText: "",
        insertText: "",
        insertImage,
        removeImage,
        reasoning: input.reasoning,
        contentHashAtSuggestion: hash,
      });
      if (existing) {
        await deps.updateComment({ id: existing.comment.id, content });
        suggestionIds.push(existing.comment.id);
      } else {
        const id = deps.createId();
        await deps.insertComment({
          id,
          reportId: ctx.reportId,
          sectionId: loaded.sectionId,
          section: input.section,
          content,
          anchorText,
          contentPath: resolvedField,
        });
        suggestionIds.push(id);
      }
    }
    const extra = pending.slice(rendered.rendered.length).map((hit) => hit.comment.id);
    await deps.dismissComments(extra);
    return {
      status: "proposed",
      suggestionId: suggestionIds[0]!,
      suggestionIds,
      section: input.section,
      targetField: resolvedField,
      summary: input.reasoning,
    };
  }

  if (mode === "accepted-restyle") {
    const suggestionIds: string[] = [];
    for (let i = 0; i < rendered.rendered.length; i++) {
      const { spec, png } = rendered.rendered[i]!;
      const insertImage = insertFromRender(spec, png);
      const old = accepted[i];
      const removeImage: SuggestionImageRemove | undefined = old
        ? {
            src: old.src,
            alt: old.alt,
            width: old.width,
            mediaId: old.mediaId,
            index: old.index,
            chartSpec: old.chartSpec ?? undefined,
          }
        : undefined;
      const check = checkProposedEdit(
        fieldText,
        {
          anchorText: removeImage ? "" : anchorText,
          deleteText: "",
          insertText: "",
          insertImage,
          removeImage,
        },
        fieldDoc
      );
      const failed = checkStatusResult(check, fieldDoc, removeImage ? "" : anchorText);
      if (failed) return failed;
      const persisted = await persistChartEdit({
        ctx,
        deps,
        loaded,
        input,
        resolvedField,
        hash,
        insertImage,
        removeImage,
        anchorText: removeImage ? "" : anchorText,
      });
      if (!("ok" in persisted)) return persisted;
      suggestionIds.push(persisted.id);
    }
    for (const leftover of accepted.slice(rendered.rendered.length)) {
      const removeImage: SuggestionImageRemove = {
        src: leftover.src,
        alt: leftover.alt,
        width: leftover.width,
        mediaId: leftover.mediaId,
        index: leftover.index,
        chartSpec: leftover.chartSpec ?? undefined,
      };
      const check = checkProposedEdit(
        fieldText,
        { anchorText: "", deleteText: "", insertText: "", removeImage },
        fieldDoc
      );
      const failed = checkStatusResult(check, fieldDoc, "");
      if (failed) return failed;
      const persisted = await persistChartEdit({
        ctx,
        deps,
        loaded,
        input,
        resolvedField,
        hash,
        removeImage,
        anchorText: "",
      });
      if (!("ok" in persisted)) return persisted;
      suggestionIds.push(persisted.id);
    }
    return {
      status: ctx.editPolicy === "commit" ? "applied" : "replaced",
      suggestionId: suggestionIds[0]!,
      suggestionIds,
      section: input.section,
      targetField: resolvedField,
      summary: input.reasoning,
    };
  }

  const suggestionIds: string[] = [];
  for (const { spec, png } of rendered.rendered) {
    const insertImage = insertFromRender(spec, png);
    const check = checkProposedEdit(
      fieldText,
      {
        anchorText,
        deleteText: "",
        insertText: "",
        insertImage,
      },
      fieldDoc
    );
    const failed = checkStatusResult(check, fieldDoc, anchorText);
    if (failed) return failed;
    const persisted = await persistChartEdit({
      ctx,
      deps,
      loaded,
      input,
      resolvedField,
      hash,
      insertImage,
      anchorText,
    });
    if (!("ok" in persisted)) return persisted;
    suggestionIds.push(persisted.id);
  }
  return {
    status: ctx.editPolicy === "commit" ? "applied" : "proposed",
    suggestionId: suggestionIds[0]!,
    suggestionIds,
    section: input.section,
    targetField: resolvedField,
    summary: input.reasoning,
  };
}
