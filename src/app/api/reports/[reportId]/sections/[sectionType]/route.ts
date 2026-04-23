import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reportSections, reports, sectionTypeEnum } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import type { SectionType } from "@/db/schema";

function isValidSection(value: string): value is SectionType {
  return (sectionTypeEnum.enumValues as readonly string[]).includes(value);
}

/** PATCH and POST use the same body; POST exists for `navigator.sendBeacon` (always POST). */
async function saveSection(
  req: Request,
  { params }: { params: Promise<{ reportId: string; sectionType: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId, sectionType } = await params;
  if (!isValidSection(sectionType)) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  }

  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const engineerAuthor = user.role === "engineer" && user.id === report.authorId;
  const managerUser = user.role === "manager";

  const canSave =
    (engineerAuthor &&
      report.status !== "approved" &&
      report.status !== "submitted" &&
      (report.status === "draft" ||
        report.status === "feedback" ||
        report.status === "in_review")) ||
    (managerUser && (report.status === "submitted" || report.status === "in_review"));

  if (!canSave) {
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
    return NextResponse.json({ section: inserted });
  }

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
