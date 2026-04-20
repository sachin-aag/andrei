import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
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

export const maxDuration = 60;

const bodySchema = z.object({
  sections: z.array(z.string()).optional(),
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

  const results = await Promise.all(
    sectionRows.map(async (row) => {
      const evaluations = await evaluateSection({
        section: row.section,
        content: row.content,
        reportContext: { deviationNo: report.deviationNo, date: report.date },
      });
      return { sectionRow: row, evaluations };
    })
  );

  // Note: neon-http driver does not support multi-statement transactions,
  // so we run these statements sequentially on the base db connection.
  for (const { sectionRow, evaluations } of results) {
    const existing = await db
      .select()
      .from(criteriaEvaluations)
      .where(eq(criteriaEvaluations.sectionId, sectionRow.id));

    const existingByKey = new Map(existing.map((e) => [e.criterionKey, e]));

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
        });
      }
    }
  }

  const updated = await db
    .select()
    .from(criteriaEvaluations)
    .where(eq(criteriaEvaluations.reportId, reportId));

  return NextResponse.json({ evaluations: updated });
}
