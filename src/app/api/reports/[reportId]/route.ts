import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { canViewReport } from "@/lib/reports/access";
import { loadReportSubtables } from "@/lib/reports/bundle";
import {
  DUPLICATE_DEVIATION_NO_ERROR,
  isDeviationNoTaken,
  normalizeDeviationNo,
} from "@/lib/reports/deviation-no";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;

  // Authorize before loading the heavier section/eval/comment rows so a
  // forbidden request never pays for the full bundle fetch.
  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canViewReport(user, report)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { sections, evaluations, comments } =
    await loadReportSubtables(reportId);

  return NextResponse.json({ report, sections, evaluations, comments });
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

  if (parse.data.deviationNo !== undefined) {
    const normalized = normalizeDeviationNo(parse.data.deviationNo);
    if (!normalized) {
      return NextResponse.json({ error: "Deviation number is required" }, { status: 400 });
    }
    if (await isDeviationNoTaken(normalized, user.id, reportId)) {
      return NextResponse.json({ error: DUPLICATE_DEVIATION_NO_ERROR }, { status: 409 });
    }
    updates.deviationNo = normalized;
  }

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
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
