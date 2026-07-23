import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reports, reportSections } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { contextForPrompt } from "@/lib/ai/section-context";
import { generateNextQuestion } from "@/lib/ai/generate-next-question";
import { EDITABLE_SECTIONS } from "@/types/sections";
import type { SectionType } from "@/db/schema";

const bodySchema = z.object({
  currentSection: z.enum(
    EDITABLE_SECTIONS as unknown as [string, ...string[]]
  ),
  answeredSoFar: z.array(
    z.object({
      section: z.string(),
      criteriaKeys: z.array(z.string()),
      label: z.string(),
      answer: z.string().nullable(),
    })
  ),
  methodology: z.enum(["5-why", "6m", "combined"]).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reportId } = await params;

  const [report] = await db
    .select({
      authorId: reports.authorId,
      deviationNo: reports.deviationNo,
      status: reports.status,
    })
    .from(reports)
    .where(eq(reports.id, reportId));

  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (user.role !== "engineer" || user.id !== report.authorId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { currentSection, answeredSoFar, methodology } = body.data;

  const [sectionRow] = await db
    .select({ content: reportSections.content })
    .from(reportSections)
    .where(
      and(
        eq(reportSections.reportId, reportId),
        eq(reportSections.section, currentSection as SectionType)
      )
    )
    .limit(1);

  const existingContent = sectionRow?.content
    ? contextForPrompt(currentSection as SectionType, sectionRow.content)
    : "";

  try {
    const result = await generateNextQuestion({
      deviationNo: report.deviationNo,
      currentSection: currentSection as (typeof EDITABLE_SECTIONS)[number],
      existingContent: existingContent ?? "",
      answeredSoFar: answeredSoFar as Parameters<typeof generateNextQuestion>[0]["answeredSoFar"],
      methodology,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[guided-draft/next-question] error:", err);
    return NextResponse.json(
      { error: "Failed to generate question. Please try again." },
      { status: 500 }
    );
  }
}
