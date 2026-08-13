import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reportSections, reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromUser, recordSectionVersion } from "@/lib/audit";
import { isValidSection } from "@/lib/document-types";
import { canSaveReportSection } from "@/lib/reports/access";

/** PATCH and POST use the same body; POST exists for `navigator.sendBeacon` (always POST). */
async function saveSection(
  req: Request,
  { params }: { params: Promise<{ reportId: string; sectionType: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId, sectionType } = await params;

  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isValidSection(report.documentType, sectionType)) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  }

  if (!canSaveReportSection(user, report)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const content = "content" in body ? body.content : body;

  const [existing] = await db
    .select()
    .from(reportSections)
    .where(
      and(
        eq(reportSections.reportId, reportId),
        eq(reportSections.section, sectionType)
      )
    );

  if (!existing) {
    const [inserted] = await db
      .insert(reportSections)
      .values({
        reportId,
        section: sectionType,
        content: content as Record<string, unknown>,
      })
      .returning();

    await recordSectionVersion({
      actor: auditActorFromUser(user),
      reportId,
      sectionId: inserted.id,
      section: sectionType,
      previousContent: {},
      newContent: content,
    });

    return NextResponse.json({ section: inserted });
  }

  await recordSectionVersion({
    actor: auditActorFromUser(user),
    reportId,
    sectionId: existing.id,
    section: sectionType,
    previousContent: existing.content,
    newContent: content,
  });

  const [updated] = await db
    .update(reportSections)
    .set({ content: content as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(reportSections.id, existing.id))
    .returning();

  return NextResponse.json({ section: updated });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ reportId: string; sectionType: string }> }
) {
  return saveSection(req, ctx);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ reportId: string; sectionType: string }> }
) {
  return saveSection(req, ctx);
}
