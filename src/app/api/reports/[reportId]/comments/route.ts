import { NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { comments, reports, sectionTypeEnum } from "@/db/schema";
import type { SectionType } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;

  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.reportId, reportId))
    .orderBy(asc(comments.createdAt));
  return NextResponse.json({ comments: rows });
}

const sectionValues = sectionTypeEnum.enumValues;
const createSchema = z.object({
  content: z.string().min(1),
  anchorText: z.string().optional().default(""),
  sectionId: z.string().optional(),
  section: z.enum(sectionValues).optional(),
});

export async function POST(
  req: Request,
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
  if (user.role !== "manager") {
    return NextResponse.json(
      { error: "Only managers can comment" },
      { status: 403 }
    );
  }

  const parse = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const [inserted] = await db
    .insert(comments)
    .values({
      reportId,
      sectionId: parse.data.sectionId ?? null,
      section: (parse.data.section as SectionType | undefined) ?? null,
      authorId: user.id,
      content: parse.data.content,
      anchorText: parse.data.anchorText ?? "",
    })
    .returning();

  if (report.status === "submitted") {
    await db
      .update(reports)
      .set({ status: "in_review", updatedAt: new Date() })
      .where(eq(reports.id, reportId));
  }

  return NextResponse.json({ comment: inserted });
}
