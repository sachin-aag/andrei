import { NextResponse } from "next/server";
import { eq, inArray, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  reports,
  reportSections,
  criteriaEvaluations,
  sectionTypeEnum,
} from "@/db/schema";
import type { SectionType } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { evaluateSection } from "@/lib/ai/evaluate";
import { EVALUATABLE_SECTIONS } from "@/lib/ai/criteria";
import {
  normalizeAnalyzeToolResults,
} from "@/lib/ai/evaluate-run-helpers";
import { hashContent } from "@/lib/ai/content-hash";
import { PROMPT_VERSION } from "@/lib/ai/section-prompts";
import {
  hasEnoughContextInFirstSection,
  INSUFFICIENT_FIRST_SECTION_MESSAGE,
} from "@/lib/ai/first-section-context";

export const maxDuration = 60;

const bodySchema = z.object({
  sections: z.array(z.string()).optional(),
  reason: z.enum(["manual", "idle", "post-action"]).optional(),
});

function isValidSection(v: string): v is SectionType {
  return (sectionTypeEnum.enumValues as readonly string[]).includes(v);
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
    return NextResponse.json({ error: INSUFFICIENT_FIRST_SECTION_MESSAGE }, { status: 400 });
  }

  // Look up existing evaluations so we can UPDATE rather than double-INSERT.
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

  // ── 1. Run the LLM in parallel for all target sections ──────────────────
  const llmResults = await Promise.all(
    sectionRows.map(async (row) => {
      const evaluations = await evaluateSection({
        section: row.section,
        content: row.content,
        reportContext: { deviationNo: report.deviationNo, date: report.date },
      });
      return {
        sectionRow: row,
        evaluations:
          row.section === "analyze"
            ? normalizeAnalyzeToolResults(row.content, evaluations)
            : evaluations,
      };
    })
  );

  // ── 2. Persist evaluation rows (UPDATE existing / INSERT new) ───────────
  // neon-http: no transactions, so sequential statements.
  for (const { sectionRow, evaluations } of llmResults) {
    const existing = existingBySectionId.get(sectionRow.id) ?? [];
    const existingByKey = new Map(existing.map((e) => [e.criterionKey, e]));
    const contentHash = hashContent(sectionRow.content, PROMPT_VERSION);

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
            bypassed: keepBypass,
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
          evaluatedContentHash: contentHash,
        });
      }
    }
  }

  // ── 3. Re-fetch all evaluations for this report ─────────────────────────
  const updatedEvals = await db
    .select()
    .from(criteriaEvaluations)
    .where(eq(criteriaEvaluations.reportId, reportId));

  return NextResponse.json({
    evaluations: updatedEvals,
    overflowCounts: {},
  });
}
