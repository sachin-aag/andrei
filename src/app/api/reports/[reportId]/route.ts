import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reports, reportSections, criteriaEvaluations, comments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;

  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sectionRows = await db
    .select()
    .from(reportSections)
    .where(eq(reportSections.reportId, reportId));

  const evals = await db
    .select()
    .from(criteriaEvaluations)
    .where(eq(criteriaEvaluations.reportId, reportId));

  const commentsRows = await db
    .select()
    .from(comments)
    .where(eq(comments.reportId, reportId));

  return NextResponse.json({
    report,
    sections: sectionRows,
    evaluations: evals,
    comments: commentsRows,
  });
}

const patchSchema = z.object({
  deviationNo: z.string().optional(),
  date: z.string().optional(),
  toolsUsed: z
    .object({
      sixM: z.boolean(),
      fiveWhy: z.boolean(),
      brainstorming: z.boolean(),
    })
    .optional(),
  otherTools: z.string().optional(),
  assignedManagerId: z.string().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;

  const parse = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { ...parse.data, updatedAt: new Date() };
  if (parse.data.date) updates.date = new Date(parse.data.date);

  const [updated] = await db
    .update(reports)
    .set(updates)
    .where(eq(reports.id, reportId))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ report: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;

  const [existing] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!existing) return NextResponse.json({ ok: true });
  if (existing.authorId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.delete(reports).where(eq(reports.id, reportId));
  return NextResponse.json({ ok: true });
}
