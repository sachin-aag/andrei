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
import { evaluateSection } from "@/lib/ai/evaluate";
import { EVALUATABLE_SECTIONS, getCriteria } from "@/lib/ai/criteria";
import { hashContent } from "@/lib/ai/content-hash";
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

/** Maximum AI comments materialized per section. Lower-priority overflow evals
 *  are still persisted (criteria sheet sees them) but don't get inline marks
 *  or gutter comment cards. */
const MAX_AI_COMMENTS_PER_SECTION = 3;

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

function contentForPrompt(section: SectionType, content: unknown): string {
  // Prefer human-readable narrative/outcome fields over raw JSON dumps when available.
  if (section === "analyze" && content && typeof content === "object") {
    const outcome = (content as { investigationOutcome?: unknown }).investigationOutcome;
    if (typeof outcome === "string" && outcome.trim()) return outcome.trim();
  }
  if (content && typeof content === "object") {
    const narrative = (content as { narrative?: unknown }).narrative;
    if (narrative != null) {
      const asJson = JSON.stringify(narrative, null, 2);
      if (asJson && asJson !== "{}") return asJson;
    }
  }
  return typeof content === "string" ? content : JSON.stringify(content, null, 2);
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

  const sectionHashes = new Map<string, string>();
  for (const row of sectionRows) sectionHashes.set(row.id, hashContent(row.content));

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
          const raw = contentForPrompt(section, prior.content);
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
      return { sectionRow: row, evaluations };
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

  const overflowCounts: Partial<Record<SectionType, number>> = {};

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
    const isNarrativeSection = NARRATIVE_SECTIONS.has(sectionRow.section);
    let narrativeChanged = false;
    let materializedCount = 0;

    for (const ev of evalsForSection) {
      const linked = aiCommentsBySectionEval.get(ev.id);
      const fix = (ev.suggestedFix ?? null) as
        | { anchorText: string; replacementText: string }
        | null;
      // Source of truth for "did the user act on this?" is the linked AI
      // comment (open / resolved / dismissed), NOT the legacy `fixApplied`
      // boolean — which was set true by the old one-click Apply flow even
      // when no inline marks were ever injected. We deliberately ignore it
      // here so existing partially_met / not_met rows backfill correctly.
      const wantsSuggestion =
        (ev.status === "partially_met" || ev.status === "not_met") &&
        !ev.bypassed &&
        !!fix?.replacementText?.trim();

      // ── Overflow cap: only materialize the first N suggestions per section.
      // Evals beyond the cap that have existing open comments get dismissed
      // (reuses Case A cleanup), but the eval row stays for the criteria sheet.
      if (wantsSuggestion && materializedCount >= MAX_AI_COMMENTS_PER_SECTION) {
        // Dismiss any existing open comment + strip inline marks.
        if (linked && linked.status === "open") {
          if (isNarrativeSection && narrative) {
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
        overflowCounts[sectionRow.section] =
          (overflowCounts[sectionRow.section] ?? 0) + 1;
        continue;
      }

      // Case A: criterion now met (or no longer wants a suggestion). Clean up
      // any open AI comment + inline marks. Leave already-acted comments.
      if (!wantsSuggestion) {
        if (linked && linked.status === "open") {
          if (isNarrativeSection && narrative) {
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

      // Case C: open + the inline marks for this eval are still present in
      // the doc → idempotent, nothing to do. If the marks are missing
      // (legacy Apply flow stripped them, or the user manually deleted the
      // tracked-change spans), fall through to Case D so the suggestion
      // gets re-materialized inline.
      if (linked && linked.status === "open" && isNarrativeSection && narrative) {
        const sameAnchor = (linked.anchorText ?? "") === (fix?.anchorText ?? "");
        const marksPresent = hasMarksWithId(narrative, ev.id);
        if (sameAnchor && marksPresent) {
          materializedCount++;
          continue;
        }
      }

      // Case D: need to (re)materialize. Strip prior marks + (re)create comment.
      materializedCount++;
      if (isNarrativeSection && narrative) {
        if (linked) {
          const stripped = stripSuggestionMarksById(narrative, ev.id);
          if (JSON.stringify(stripped) !== JSON.stringify(narrative)) {
            narrative = stripped;
            narrativeChanged = true;
          }
        }
        const result = injectSuggestionMarks(
          narrative,
          fix!.anchorText,
          fix!.replacementText,
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
              anchorText: fix!.anchorText,
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
            anchorText: fix!.anchorText,
            contentPath: "narrative",
            fromPos: result.insertFromPos,
            toPos: result.insertToPos,
            status: "open",
            kind: "ai_fix",
            evaluationId: ev.id,
          });
        }
      } else {
        // Non-narrative section (analyze): no inline marks. The AI comment is
        // unanchored at the section header — gutter renders it like any other
        // unanchored comment.
        if (linked) {
          await db
            .update(comments)
            .set({
              content: ev.reasoning,
              anchorText: fix!.anchorText,
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
            anchorText: fix!.anchorText,
            contentPath: null,
            fromPos: null,
            toPos: null,
            status: "open",
            kind: "ai_fix",
            evaluationId: ev.id,
          });
        }
      }
    }

    if (isNarrativeSection && narrativeChanged) {
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
    overflowCounts,
    skipped: sectionRows
      .filter((r) => !sectionsToEvaluate.includes(r))
      .map((r) => r.section),
  });
}
