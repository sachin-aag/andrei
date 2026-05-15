import { NextResponse } from "next/server";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { JSONContent } from "@tiptap/core";
import { createId } from "@paralleldrive/cuid2";
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
import { evaluateSection, type CriterionEvaluationResult } from "@/lib/ai/evaluate";
import { EVALUATABLE_SECTIONS, getCriteria } from "@/lib/ai/criteria";
import { hashContent } from "@/lib/ai/content-hash";
import { PROMPT_VERSION } from "@/lib/ai/section-prompts";
import {
  EMPTY_SUGGESTED_FIX,
  coerceLegacyFix,
  hasFixContent,
  type SuggestedFix,
} from "@/lib/ai/suggested-fix";
import {
  hasEnoughContextInFirstSection,
  INSUFFICIENT_FIRST_SECTION_MESSAGE,
} from "@/lib/ai/first-section-context";
import {
  injectSuggestionMarks,
  stripSuggestionMarksById,
} from "@/lib/tiptap/suggestion-inject";
import {
  suggestionInsertMarkName,
  suggestionDeleteMarkName,
} from "@/lib/tiptap/suggestion-marks";

/** True if the doc contains any suggestion mark whose attrs.id === id. */
function hasMarksWithId(doc: unknown, id: string): boolean {
  if (!doc || typeof doc !== "object") return false;
  const node = doc as JSONContent;
  if (node.marks?.length) {
    for (const m of node.marks) {
      if (
        (m.type === suggestionInsertMarkName ||
          m.type === suggestionDeleteMarkName) &&
        (m.attrs as { id?: string } | undefined)?.id === id
      ) {
        return true;
      }
    }
  }
  if (node.content?.length) {
    for (const ch of node.content) {
      if (hasMarksWithId(ch, id)) return true;
    }
  }
  return false;
}

export const maxDuration = 60;

const bodySchema = z.object({
  sections: z.array(z.string()).optional(),
  reason: z.enum(["manual", "idle", "post-action"]).optional(),
});

function isValidSection(v: string): v is SectionType {
  return (sectionTypeEnum.enumValues as readonly string[]).includes(v);
}

const SEVERITY_ORDER: Record<string, number> = {
  not_met: 0,
  partially_met: 1,
  met: 2,
  not_evaluated: 3,
};

/** Sections whose primary AI-suggestion target is a Tiptap-backed `narrative`. */
const NARRATIVE_SECTIONS = new Set<SectionType>([
  "define",
  "measure",
  "improve",
  "control",
]);

function getNarrative(content: unknown): JSONContent | null {
  if (
    content &&
    typeof content === "object" &&
    "narrative" in content &&
    (content as { narrative?: unknown }).narrative
  ) {
    return (content as { narrative: JSONContent }).narrative;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function compactText(value: string, maxChars = 1200): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trim()}...`;
}

function tiptapText(value: unknown): string {
  const pieces: string[] = [];
  function visit(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as JSONContent;
    if (typeof n.text === "string") pieces.push(n.text);
    if (n.type === "hardBreak" || n.type === "paragraph") pieces.push("\n");
    if (n.content?.length) n.content.forEach(visit);
  }
  visit(value);
  return pieces.join(" ").replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").trim();
}

function pushTextLine(
  lines: string[],
  label: string,
  value: unknown,
  maxChars?: number
) {
  if (typeof value !== "string") return;
  const text = compactText(value, maxChars);
  if (text) lines.push(`${label}: ${text}`);
}

function pushNarrativeLine(lines: string[], content: Record<string, unknown>) {
  const text = tiptapText(content.narrative);
  if (text) lines.push(`Narrative excerpt: ${compactText(text, 1600)}`);
}

function pushObjectFields(
  lines: string[],
  heading: string,
  value: unknown,
  fields: Array<[string, string]>
) {
  if (!isRecord(value)) return;
  const fieldLines: string[] = [];
  for (const [key, label] of fields) {
    const fieldValue = value[key];
    if (typeof fieldValue === "string" && fieldValue.trim()) {
      fieldLines.push(`${label}: ${compactText(fieldValue, 500)}`);
    }
  }
  if (fieldLines.length) lines.push(`${heading}: ${fieldLines.join("; ")}`);
}

function fallbackContextForPrompt(content: unknown): string {
  if (typeof content === "string") return content;
  return JSON.stringify(content, null, 2);
}

function contextForPrompt(section: SectionType, content: unknown): string {
  if (!isRecord(content)) return fallbackContextForPrompt(content);

  const lines: string[] = [];
  if (section === "define") {
    pushNarrativeLine(lines, content);
  } else if (section === "measure") {
    pushNarrativeLine(lines, content);
    pushTextLine(lines, "Regulatory notification", content.regulatoryNotification);
  } else if (section === "analyze") {
    pushObjectFields(lines, "6M", content.sixM, [
      ["man", "Man"],
      ["machine", "Machine"],
      ["measurement", "Measurement"],
      ["material", "Material"],
      ["method", "Method"],
      ["milieu", "Milieu"],
      ["conclusion", "Conclusion"],
    ]);
    pushObjectFields(lines, "5-Why", content.fiveWhy, [
      ["narrative", "Chain"],
      ["conclusion", "Conclusion"],
    ]);
    pushTextLine(lines, "Investigation outcome", content.investigationOutcome);
    pushObjectFields(lines, "Root cause", content.rootCause, [
      ["narrative", "Narrative"],
      ["primaryLevel1", "Level 1"],
      ["secondaryLevel2", "Level 2"],
      ["thirdLevel3", "Level 3"],
    ]);
    pushObjectFields(lines, "Impact assessment", content.impactAssessment, [
      ["system", "System"],
      ["document", "Document"],
      ["product", "Product"],
      ["equipment", "Equipment"],
      ["patientSafety", "Patient safety"],
    ]);
  } else if (section === "improve") {
    pushNarrativeLine(lines, content);
    const actions = Array.isArray(content.correctiveActions)
      ? content.correctiveActions
      : [];
    actions.slice(0, 8).forEach((action, index) => {
      if (!isRecord(action)) return;
      const parts: string[] = [];
      pushTextLine(parts, "description", action.description, 600);
      pushTextLine(parts, "responsible", action.responsiblePerson, 250);
      pushTextLine(parts, "due", action.dueDate, 120);
      pushTextLine(parts, "outcome", action.expectedOutcome, 350);
      pushTextLine(parts, "effectiveness", action.effectivenessVerification, 350);
      if (parts.length) lines.push(`Corrective action ${index + 1}: ${parts.join("; ")}`);
    });
    if (actions.length > 8) lines.push(`[${actions.length - 8} more corrective actions omitted]`);
  } else if (section === "control") {
    pushNarrativeLine(lines, content);
    pushTextLine(lines, "Preventive actions", content.preventiveActions, 1800);
    pushTextLine(lines, "Interim plan", content.interimPlan);
    pushTextLine(lines, "Final comments", content.finalComments);
    pushTextLine(lines, "Regulatory impact", content.regulatoryImpact);
    pushTextLine(lines, "Product quality", content.productQuality);
    pushTextLine(lines, "Validation", content.validation);
    pushTextLine(lines, "Stability", content.stability);
    pushTextLine(lines, "Market/clinical", content.marketClinical);
    pushTextLine(lines, "Lot disposition", content.lotDisposition);
    pushTextLine(lines, "Conclusion", content.conclusion, 1800);
  }

  return lines.length ? lines.join("\n") : fallbackContextForPrompt(content);
}

type AnalyzeTool = "sixM" | "fiveWhy";

function meaningfulAnalyzeText(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase().replace(/\.+$/, "");
  return normalized.length > 0 && normalized !== "not applicable" && normalized !== "n/a";
}

function existingAnalyzeTool(content: unknown): AnalyzeTool | null {
  if (!content || typeof content !== "object") return null;
  const c = content as {
    sixM?: Record<string, unknown>;
    fiveWhy?: Record<string, unknown>;
  };
  const hasSixM = c.sixM
    ? Object.values(c.sixM).some(meaningfulAnalyzeText)
    : false;
  const hasFiveWhy = c.fiveWhy
    ? [c.fiveWhy.narrative, c.fiveWhy.conclusion].some(meaningfulAnalyzeText)
    : false;

  if (hasSixM && !hasFiveWhy) return "sixM";
  if (hasFiveWhy && !hasSixM) return "fiveWhy";
  return null;
}

function fixTargetsAnalyzeTool(fix: SuggestedFix, tool: AnalyzeTool): boolean {
  if (fix.kind !== "fields") return false;
  const prefix = tool === "sixM" ? "sixM." : "fiveWhy.";
  return fix.ops.some((op) => op.path.startsWith(prefix));
}

function chooseAnalyzeTool(
  content: unknown,
  evaluations: CriterionEvaluationResult[]
): AnalyzeTool | null {
  const existingTool = existingAnalyzeTool(content);
  if (existingTool) return existingTool;

  const sixMEval = evaluations.find((e) => e.criterionKey === "analyze.sixm_completeness");
  const fiveWhyEval = evaluations.find(
    (e) => e.criterionKey === "analyze.fivewhy_completeness"
  );
  const wantsSixM = sixMEval
    ? fixTargetsAnalyzeTool(coerceLegacyFix(sixMEval.suggestedFix), "sixM")
    : false;
  const wantsFiveWhy = fiveWhyEval
    ? fixTargetsAnalyzeTool(coerceLegacyFix(fiveWhyEval.suggestedFix), "fiveWhy")
    : false;

  if (wantsSixM && !wantsFiveWhy) return "sixM";
  if (wantsFiveWhy && !wantsSixM) return "fiveWhy";
  if (wantsSixM && wantsFiveWhy) return "fiveWhy";
  return null;
}

function normalizeAnalyzeToolSuggestions(
  content: unknown,
  evaluations: CriterionEvaluationResult[]
): CriterionEvaluationResult[] {
  const chosenTool = chooseAnalyzeTool(content, evaluations);
  if (!chosenTool) return evaluations;

  const unusedKey =
    chosenTool === "fiveWhy"
      ? "analyze.sixm_completeness"
      : "analyze.fivewhy_completeness";
  const chosenLabel = chosenTool === "fiveWhy" ? "5-Why" : "6M";
  const unusedLabel = chosenTool === "fiveWhy" ? "6M" : "5-Why";

  return evaluations.map((evaluation) => {
    if (evaluation.criterionKey !== unusedKey) return evaluation;
    return {
      ...evaluation,
      status: "met",
      reasoning: `${chosenLabel} methodology selected for this Analyze pass; ${unusedLabel} remains Not Applicable because the root-cause tool requirement is satisfied by one completed methodology.`,
      suggestedFix: EMPTY_SUGGESTED_FIX,
    };
  });
}

function primaryFieldPath(fix: SuggestedFix): string | null {
  if (fix.kind !== "fields") return null;
  return fix.ops[0]?.path ?? null;
}

function normalizePromptText(s: string, maxChars = 6000): string {
  const trimmed = s.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\n\n[Truncated for context length]`;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  const requestedSections = parsed.success ? parsed.data.sections : undefined;
  const reason = parsed.success ? parsed.data.reason ?? "manual" : "manual";
  const force = reason === "manual";

  const targetSections: SectionType[] = (requestedSections ?? EVALUATABLE_SECTIONS).filter(
    (s): s is SectionType => isValidSection(s)
  );

  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sectionRows = await db
    .select()
    .from(reportSections)
    .where(
      and(
        eq(reportSections.reportId, reportId),
        inArray(reportSections.section, targetSections)
      )
    );

  // Pull all evaluatable section rows for this report so each section evaluation
  // can reference prior sections for chronology/consistency.
  const allEvaluatableRows = await db
    .select()
    .from(reportSections)
    .where(
      and(
        eq(reportSections.reportId, reportId),
        inArray(reportSections.section, EVALUATABLE_SECTIONS)
      )
    );
  const bySection = new Map<SectionType, (typeof allEvaluatableRows)[number]>();
  for (const row of allEvaluatableRows) bySection.set(row.section, row);

  const defineRow = bySection.get("define");
  if (!hasEnoughContextInFirstSection(defineRow?.content)) {
    if (reason === "manual") {
      return NextResponse.json({ error: INSUFFICIENT_FIRST_SECTION_MESSAGE }, { status: 400 });
    }
    const [updatedEvals, updatedSections, updatedComments] = await Promise.all([
      db.select().from(criteriaEvaluations).where(eq(criteriaEvaluations.reportId, reportId)),
      db.select().from(reportSections).where(eq(reportSections.reportId, reportId)),
      db
        .select()
        .from(comments)
        .where(and(eq(comments.reportId, reportId), ne(comments.status, "dismissed"))),
    ]);
    return NextResponse.json({
      evaluations: updatedEvals,
      sections: updatedSections,
      comments: updatedComments,
      skipped: targetSections,
    });
  }

  // Hashes are salted with PROMPT_VERSION so cached evaluations are
  // invalidated when the system prompt changes, even if section content didn't.
  const sectionHashes = new Map<string, string>();
  for (const row of sectionRows)
    sectionHashes.set(row.id, hashContent(row.content, PROMPT_VERSION));

  const existingForSections = sectionRows.length
    ? await db
        .select()
        .from(criteriaEvaluations)
        .where(
          inArray(
            criteriaEvaluations.sectionId,
            sectionRows.map((r) => r.id)
          )
        )
    : [];
  const existingBySectionId = new Map<string, typeof existingForSections>();
  for (const row of existingForSections) {
    const arr = existingBySectionId.get(row.sectionId) ?? [];
    arr.push(row);
    existingBySectionId.set(row.sectionId, arr);
  }

  function isFresh(sectionRowId: string, section: SectionType): boolean {
    if (force) return false;
    const expectedKeys = getCriteria(section).map((c) => c.key);
    if (expectedKeys.length === 0) return true;
    const existing = existingBySectionId.get(sectionRowId) ?? [];
    if (existing.length < expectedKeys.length) return false;
    const currentHash = sectionHashes.get(sectionRowId);
    if (!currentHash) return false;
    const byKey = new Map(existing.map((e) => [e.criterionKey, e]));
    for (const key of expectedKeys) {
      const row = byKey.get(key);
      if (!row) return false;
      if (row.evaluatedContentHash !== currentHash) return false;
      if (row.status === "not_evaluated") return false;
    }
    return true;
  }

  const sectionsToEvaluate = sectionRows.filter((row) => !isFresh(row.id, row.section));

  // ── 1. Run the LLM in parallel for sections that need it ───────────────
  const llmResults = await Promise.all(
    sectionsToEvaluate.map(async (row) => {
      const idx = EVALUATABLE_SECTIONS.indexOf(row.section);
      const previousSections = EVALUATABLE_SECTIONS.slice(0, Math.max(0, idx))
        .map((section) => {
          const prior = bySection.get(section);
          if (!prior) return null;
          const raw = contextForPrompt(section, prior.content);
          if (!raw || raw.trim() === "" || raw.trim() === "{}") return null;
          return {
            section,
            content: normalizePromptText(raw),
          };
        })
        .filter(
          (v): v is { section: SectionType; content: string } => v != null
        );

      const evaluations = await evaluateSection({
        section: row.section,
        content: row.content,
        reportContext: { deviationNo: report.deviationNo, date: report.date },
        previousSections,
      });
      return {
        sectionRow: row,
        evaluations:
          row.section === "analyze"
            ? normalizeAnalyzeToolSuggestions(row.content, evaluations)
            : evaluations,
      };
    })
  );

  // ── 2. Persist evaluation rows (UPDATE existing / INSERT new) ───────────
  // neon-http: no transactions, so sequential statements.
  for (const { sectionRow, evaluations } of llmResults) {
    const existing = existingBySectionId.get(sectionRow.id) ?? [];
    const existingByKey = new Map(existing.map((e) => [e.criterionKey, e]));
    const contentHash = sectionHashes.get(sectionRow.id) ?? "";

    for (const evalResult of evaluations) {
      const prior = existingByKey.get(evalResult.criterionKey);
      if (prior) {
        const keepBypass = prior.bypassed && evalResult.status !== "met";
        await db
          .update(criteriaEvaluations)
          .set({
            section: sectionRow.section,
            status: evalResult.status,
            criterionLabel: evalResult.criterionLabel,
            reasoning: evalResult.reasoning,
            suggestedFix: evalResult.suggestedFix,
            bypassed: keepBypass,
            fixApplied: evalResult.status === "met" ? true : prior.fixApplied,
            evaluatedContentHash: contentHash,
            updatedAt: new Date(),
          })
          .where(eq(criteriaEvaluations.id, prior.id));
      } else {
        await db.insert(criteriaEvaluations).values({
          reportId,
          sectionId: sectionRow.id,
          section: sectionRow.section,
          criterionKey: evalResult.criterionKey,
          criterionLabel: evalResult.criterionLabel,
          status: evalResult.status,
          reasoning: evalResult.reasoning,
          suggestedFix: evalResult.suggestedFix,
          evaluatedContentHash: contentHash,
        });
      }
    }
  }

  // ── 3. Re-fetch fresh eval rows for ALL target sections (incl. cached) ─
  // Cached sections may carry stale "no comment yet" rows that the backfill
  // pass should still materialize, so we can't restrict to sectionsToEvaluate.
  const freshEvals = sectionRows.length
    ? await db
        .select()
        .from(criteriaEvaluations)
        .where(
          inArray(
            criteriaEvaluations.sectionId,
            sectionRows.map((r) => r.id)
          )
        )
    : [];

  // ── 4. Materialize inline AI suggestions + linked comments ──────────────
  // For each section, walk its evaluations and reconcile inline marks +
  // ai_fix comments in the DB. Also handles the one-time backfill path.
  const aiCommentsBySectionEval = new Map<string, typeof comments.$inferSelect>();
  if (freshEvals.length) {
    const all = await db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.reportId, reportId),
          inArray(
            comments.evaluationId,
            freshEvals.map((e) => e.id)
          )
        )
      );
    for (const c of all) {
      if (c.evaluationId) aiCommentsBySectionEval.set(c.evaluationId, c);
    }
  }

  for (const sectionRow of sectionRows) {
    const evalsForSection = freshEvals.filter((e) => e.sectionId === sectionRow.id);
    if (evalsForSection.length === 0) continue;

    // Sort by severity so worst issues get materialized first.
    evalsForSection.sort(
      (a, b) =>
        (SEVERITY_ORDER[a.status] ?? 99) - (SEVERITY_ORDER[b.status] ?? 99)
    );

    let workingContent = sectionRow.content as unknown;
    let narrative = getNarrative(workingContent);
    const sectionHasNarrative = NARRATIVE_SECTIONS.has(sectionRow.section);
    let narrativeChanged = false;

    for (const ev of evalsForSection) {
      const linked = aiCommentsBySectionEval.get(ev.id);
      // Coerce on every read so legacy {anchorText, replacementText} rows in
      // the DB are treated as kind:"patch" and we never crash on a missing
      // discriminator.
      const fix = coerceLegacyFix(ev.suggestedFix);
      // Source of truth for "did the user act on this?" is the linked AI
      // comment (open / resolved / dismissed), NOT the legacy `fixApplied`
      // boolean — which was set true by the old one-click Apply flow even
      // when no inline marks were ever injected. We deliberately ignore it
      // here so existing partially_met / not_met rows backfill correctly.
      const wantsSuggestion =
        (ev.status === "partially_met" || ev.status === "not_met") &&
        !ev.bypassed &&
        hasFixContent(fix);
      // Inline-mark materialization only applies to patch-shape fixes against
      // narrative-bearing sections. Fields-shape fixes get an unanchored gutter
      // comment regardless of section.
      const wantsInlineMarks =
        wantsSuggestion && fix.kind === "patch" && sectionHasNarrative && !!narrative;

      // Case A: criterion now met (or no longer wants a suggestion). Clean up
      // any open AI comment + inline marks. Leave already-acted comments.
      if (!wantsSuggestion) {
        if (linked && linked.status === "open") {
          if (sectionHasNarrative && narrative) {
            const stripped = stripSuggestionMarksById(narrative, ev.id);
            if (JSON.stringify(stripped) !== JSON.stringify(narrative)) {
              narrative = stripped;
              workingContent = { ...(workingContent as object), narrative };
              narrativeChanged = true;
            }
          }
          await db
            .update(comments)
            .set({ status: "dismissed" })
            .where(eq(comments.id, linked.id));
        }
        continue;
      }

      // Case B: user already acted on the prior suggestion during normal
      // background reconciliation → respect their decision; do not
      // re-materialize. A manual re-evaluation is explicit intent to ask the
      // AI again, so it may reopen the linked suggestion if the criterion still
      // fails.
      if (
        reason !== "manual" &&
        linked &&
        (linked.status === "resolved" || linked.status === "dismissed")
      ) {
        continue;
      }

      // Case C: idempotent open-comment short-circuit.
      // - Patch fixes: keep the existing comment if its anchor matches and the
      //   inline marks are still present in the doc. If marks are missing
      //   (legacy Apply flow stripped them, or the user manually deleted the
      //   tracked-change spans), fall through to Case D so the suggestion gets
      //   re-materialized inline.
      // - Fields fixes: there are no marks to verify, so we keep the existing
      //   comment as-is unless its content (the model's reasoning) changed —
      //   Case D will refresh content when needed.
      if (linked && linked.status === "open") {
        if (fix.kind === "patch" && sectionHasNarrative && narrative) {
          const sameAnchor = (linked.anchorText ?? "") === fix.anchorText;
          const marksPresent = hasMarksWithId(narrative, ev.id);
          if (sameAnchor && marksPresent && linked.content === ev.reasoning) {
            continue;
          }
        } else if (fix.kind === "fields") {
          if (linked.content === ev.reasoning) {
            continue;
          }
        }
      }

      // Case D: need to (re)materialize. Branch on fix.kind, NOT section type
      // — improve/control can emit either patch or fields per criterion.
      if (wantsInlineMarks && fix.kind === "patch" && narrative) {
        if (linked) {
          const stripped = stripSuggestionMarksById(narrative, ev.id);
          if (JSON.stringify(stripped) !== JSON.stringify(narrative)) {
            narrative = stripped;
            narrativeChanged = true;
          }
        }
        const result = injectSuggestionMarks(
          narrative,
          fix.anchorText,
          fix.replacementText,
          {
            id: ev.id,
            authorId: "ai",
            status: "pending",
            createdAt: new Date().toISOString(),
            kind: "fix",
          }
        );
        narrative = result.doc;
        workingContent = { ...(workingContent as object), narrative };
        narrativeChanged = true;

        if (linked) {
          await db
            .update(comments)
            .set({
              content: ev.reasoning,
              anchorText: fix.anchorText,
              contentPath: "narrative",
              fromPos: result.insertFromPos,
              toPos: result.insertToPos,
              status: "open",
            })
            .where(eq(comments.id, linked.id));
        } else {
          await db.insert(comments).values({
            id: createId(),
            reportId,
            sectionId: sectionRow.id,
            section: sectionRow.section,
            authorId: "ai",
            content: ev.reasoning,
            anchorText: fix.anchorText,
            contentPath: "narrative",
            fromPos: result.insertFromPos,
            toPos: result.insertToPos,
            status: "open",
            kind: "ai_fix",
            evaluationId: ev.id,
          });
        }
      } else {
        // No inline marks for this fix — either kind:"fields", or a patch
        // emitted against a section without a narrative editor. The AI comment
        // is unanchored at the section header; the gutter card renders the
        // ops preview (for fields) or the replacement text fallback (for an
        // orphan patch).
        const anchorText = fix.kind === "patch" ? fix.anchorText : "";
        const fieldPath = primaryFieldPath(fix);
        // If we previously materialized this eval as inline marks (fix changed
        // shape across runs), strip the now-stale marks first.
        if (linked && sectionHasNarrative && narrative) {
          const stripped = stripSuggestionMarksById(narrative, ev.id);
          if (JSON.stringify(stripped) !== JSON.stringify(narrative)) {
            narrative = stripped;
            workingContent = { ...(workingContent as object), narrative };
            narrativeChanged = true;
          }
        }
        if (linked) {
          await db
            .update(comments)
            .set({
              content: ev.reasoning,
              anchorText,
              contentPath: fieldPath,
              fromPos: null,
              toPos: null,
              status: "open",
            })
            .where(eq(comments.id, linked.id));
        } else {
          await db.insert(comments).values({
            id: createId(),
            reportId,
            sectionId: sectionRow.id,
            section: sectionRow.section,
            authorId: "ai",
            content: ev.reasoning,
            anchorText,
            contentPath: fieldPath,
            fromPos: null,
            toPos: null,
            status: "open",
            kind: "ai_fix",
            evaluationId: ev.id,
          });
        }
      }
    }

    if (sectionHasNarrative && narrativeChanged) {
      await db
        .update(reportSections)
        .set({ content: workingContent as object, updatedAt: new Date() })
        .where(eq(reportSections.id, sectionRow.id));
    }
  }

  // ── 5. Read-back: return everything the client needs in one shot ────────
  const [updatedEvals, updatedSections, updatedComments] = await Promise.all([
    db.select().from(criteriaEvaluations).where(eq(criteriaEvaluations.reportId, reportId)),
    db.select().from(reportSections).where(eq(reportSections.reportId, reportId)),
    db
      .select()
      .from(comments)
      .where(and(eq(comments.reportId, reportId), ne(comments.status, "dismissed"))),
  ]);

  return NextResponse.json({
    evaluations: updatedEvals,
    sections: updatedSections,
    comments: updatedComments,
    overflowCounts: {},
    skipped: sectionRows
      .filter((r) => !sectionsToEvaluate.includes(r))
      .map((r) => r.section),
  });
}
