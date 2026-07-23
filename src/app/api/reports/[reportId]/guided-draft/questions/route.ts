import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reports, reportSections, criteriaEvaluations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { contextForPrompt } from "@/lib/ai/section-context";
import { generateGuidedQuestions } from "@/lib/ai/generate-guided-questions";
import { EDITABLE_SECTIONS } from "@/types/sections";
import type { SectionType } from "@/db/schema";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reportId } = await params;

  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (user.role !== "engineer" || user.id !== report.authorId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [sectionRows, evalRows] = await Promise.all([
    db.select().from(reportSections).where(eq(reportSections.reportId, reportId)),
    db
      .select()
      .from(criteriaEvaluations)
      .where(eq(criteriaEvaluations.reportId, reportId)),
  ]);

  // Convert section content to plain text for the prompt
  const sectionContent: Partial<Record<string, string>> = {};
  for (const row of sectionRows) {
    if ((EDITABLE_SECTIONS as readonly string[]).includes(row.section)) {
      const text = contextForPrompt(row.section as SectionType, row.content);
      if (text && text.trim() && text !== "{}") {
        sectionContent[row.section] = text;
      }
    }
  }

  const existingEvaluations = evalRows.map((e) => ({
    criterionKey: e.criterionKey,
    status: e.status,
    reasoning: e.reasoning ?? "",
  }));

  try {
    const questions = await generateGuidedQuestions({
      deviationNo: report.deviationNo,
      sectionContent,
      existingEvaluations,
    });

    return NextResponse.json({ questions });
  } catch (err) {
    console.error("[guided-draft/questions] generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate questions. Please try again." },
      { status: 500 }
    );
  }
}
