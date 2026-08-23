import { createId } from "@paralleldrive/cuid2";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { comments, criteriaEvaluations, reportSections } from "@/db/schema";
import { AI_AUTHOR_ID } from "@/lib/ai/constants";
import { isTestLoginEnabled } from "@/lib/test/ai-bypass";

const bodySchema = z.object({
  reportId: z.string().min(1),
  section: z.string().min(1),
  contentPath: z.string().min(1).default("narrative"),
  anchorText: z.string().min(1),
  insertText: z.string().default(""),
  deleteText: z.string().default(""),
  criterionKey: z.string().min(1).default("seeded_criterion"),
  criterionLabel: z.string().min(1).default("Seeded criterion"),
  status: z.enum(["not_met", "partially_met"]).default("partially_met"),
  reasoning: z.string().default("Seeded for E2E."),
});

/**
 * Seeds one OPEN `ai_fix` suggestion so E2E can exercise the inline preview
 * (and typing next to it) without an AI credential. Gated like
 * `/api/test/login`; never enabled on Vercel.
 */
export async function POST(req: Request) {
  if (!isTestLoginEnabled()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const body = parsed.data;

  const [sectionRow] = await db
    .select()
    .from(reportSections)
    .where(
      and(
        eq(reportSections.reportId, body.reportId),
        eq(reportSections.section, body.section)
      )
    );
  if (!sectionRow) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  const [evaluation] = await db
    .insert(criteriaEvaluations)
    .values({
      id: createId(),
      reportId: body.reportId,
      sectionId: sectionRow.id,
      section: body.section,
      criterionKey: body.criterionKey,
      criterionLabel: body.criterionLabel,
      status: body.status,
      reasoning: body.reasoning,
    })
    .returning();

  const [suggestion] = await db
    .insert(comments)
    .values({
      id: createId(),
      reportId: body.reportId,
      sectionId: sectionRow.id,
      section: body.section,
      authorId: AI_AUTHOR_ID,
      kind: "ai_fix",
      status: "open",
      anchorText: body.anchorText,
      contentPath: body.contentPath,
      evaluationId: evaluation!.id,
      content: JSON.stringify({
        deleteText: body.deleteText,
        insertText: body.insertText,
        reasoning: body.reasoning,
      }),
    })
    .returning();

  return NextResponse.json({
    ok: true,
    suggestionId: suggestion!.id,
    evaluationId: evaluation!.id,
  });
}
