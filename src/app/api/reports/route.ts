import { NextResponse } from "next/server";
import { desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reports, reportSections } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { EMPTY_CONTENT, EDITABLE_SECTIONS } from "@/types/sections";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows =
    user.role === "engineer"
      ? await db
          .select()
          .from(reports)
          .where(eq(reports.authorId, user.id))
          .orderBy(desc(reports.updatedAt))
      : await db
          .select()
          .from(reports)
          .where(
            or(
              eq(reports.assignedManagerId, user.id),
              eq(reports.status, "submitted"),
              eq(reports.status, "in_review")
            )
          )
          .orderBy(desc(reports.updatedAt));

  return NextResponse.json({ reports: rows });
}

const createSchema = z.object({
  deviationNo: z.string().min(1),
  assignedManagerId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "engineer") {
    return NextResponse.json(
      { error: "Only engineers can create reports" },
      { status: 403 }
    );
  }

  const parse = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const [report] = await db
    .insert(reports)
    .values({
      deviationNo: parse.data.deviationNo,
      authorId: user.id,
      assignedManagerId: parse.data.assignedManagerId ?? null,
    })
    .returning();

  await db.insert(reportSections).values(
    EDITABLE_SECTIONS.map((section) => ({
      reportId: report.id,
      section,
      content: EMPTY_CONTENT[section] as unknown as Record<string, unknown>,
    }))
  );

  return NextResponse.json({ id: report.id, report });
}
