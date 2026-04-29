import { NextResponse } from "next/server";
import { desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reports, reportSections } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { docxBufferToSectionContentMap } from "@/lib/import/docx-to-sections";
import { EMPTY_CONTENT, EDITABLE_SECTIONS } from "@/types/sections";

const MAX_DOCX_BYTES = 15 * 1024 * 1024;

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

  const contentType = req.headers.get("content-type") ?? "";

  let deviationNo: string;
  let assignedManagerId: string | null;
  let importedSections: Awaited<ReturnType<typeof docxBufferToSectionContentMap>> | null =
    null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    deviationNo = String(form.get("deviationNo") ?? "").trim();
    const mgrRaw = form.get("assignedManagerId");
    assignedManagerId =
      mgrRaw === "" || mgrRaw === null ? null : String(mgrRaw);
    const file = form.get("file");

    if (!deviationNo) {
      return NextResponse.json({ error: "Deviation number is required" }, { status: 400 });
    }

    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_DOCX_BYTES) {
        return NextResponse.json(
          { error: "Uploaded file is too large (max 15 MB)" },
          { status: 400 }
        );
      }
      const lower = file.name.toLowerCase();
      if (
        !lower.endsWith(".docx") &&
        file.type !==
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        return NextResponse.json(
          { error: "Only Word documents (.docx) are supported" },
          { status: 400 }
        );
      }
      try {
        const buf = Buffer.from(await file.arrayBuffer());
        importedSections = await docxBufferToSectionContentMap(buf);
      } catch {
        return NextResponse.json(
          {
            error:
              "Could not read that Word file. Save as .docx and try again, or create without a file.",
          },
          { status: 400 }
        );
      }
    }
  } else {
    const parse = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parse.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    deviationNo = parse.data.deviationNo;
    assignedManagerId = parse.data.assignedManagerId ?? null;
  }

  const [report] = await db
    .insert(reports)
    .values({
      deviationNo,
      authorId: user.id,
      assignedManagerId,
    })
    .returning();

  type Imported = NonNullable<typeof importedSections>;

  await db.insert(reportSections).values(
    EDITABLE_SECTIONS.map((section) => ({
      reportId: report.id,
      section,
      content: (
        importedSections !== null
          ? importedSections[section as keyof Imported]
          : EMPTY_CONTENT[section]
      ) as unknown as Record<string, unknown>,
    }))
  );

  return NextResponse.json({ id: report.id, report });
}
