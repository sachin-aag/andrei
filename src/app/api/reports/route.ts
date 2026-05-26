import { NextResponse } from "next/server";
import { desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reports, reportSections } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import type { ImportedReportContent } from "@/lib/import/docx-to-sections";
import {
  DUPLICATE_DEVIATION_NO_ERROR,
  isDeviationNoTaken,
  isPostgresUniqueViolation,
  normalizeDeviationNo,
} from "@/lib/reports/deviation-no";
import { seedBlankReportSections } from "@/lib/reports/seed-blank-report-sections";
import { REPORT_SECTION_ROW_ORDER } from "@/types/sections";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  try {
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
    let importedContent: ImportedReportContent | null = null;
    let sourceUpload: { buffer: Buffer; filename: string } | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      deviationNo = String(form.get("deviationNo") ?? "").trim();
      const mgrRaw = form.get("assignedManagerId");
      assignedManagerId =
        mgrRaw === "" || mgrRaw === null ? null : String(mgrRaw);
      const file = form.get("file");
      const hasFile = file instanceof File && file.size > 0;

      if (!deviationNo) {
        return NextResponse.json({ error: "Deviation number is required" }, { status: 400 });
      }

      if (hasFile && file instanceof File) {
        try {
          const { readDocxUpload } = await import("@/lib/import/docx-upload");
          const { docxBufferToImportedReportContent } = await import(
            "@/lib/import/docx-to-sections"
          );
          const buf = await readDocxUpload(file);
          importedContent = await docxBufferToImportedReportContent(buf);
          sourceUpload = { buffer: buf, filename: file.name };
        } catch (e) {
          const message = e instanceof Error ? e.message : "";
          if (message.includes("too large") || message.includes("Only Word")) {
            return NextResponse.json({ error: message }, { status: 400 });
          }
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

    const importedDate = importedContent?.header.date;
    const importedOtherTools = importedContent?.header.otherTools?.trim();
    const finalDeviationNo = normalizeDeviationNo(deviationNo);

    if (!finalDeviationNo) {
      return NextResponse.json({ error: "Deviation number is required" }, { status: 400 });
    }

    if (await isDeviationNoTaken(finalDeviationNo, user.id)) {
      return NextResponse.json({ error: DUPLICATE_DEVIATION_NO_ERROR }, { status: 409 });
    }

    const [report] = await db
      .insert(reports)
      .values({
        deviationNo: finalDeviationNo,
        authorId: user.id,
        assignedManagerId,
        ...(importedContent
          ? {
              toolsUsed: importedContent.toolsUsed,
              ...(importedDate ? { date: importedDate } : {}),
              ...(importedOtherTools !== undefined ? { otherTools: importedOtherTools } : {}),
            }
          : {}),
      })
      .returning();

    if (!report) {
      throw new Error("insert(reports).returning() returned no row");
    }

    const blankSections = seedBlankReportSections();
    await db.insert(reportSections).values(
      REPORT_SECTION_ROW_ORDER.map((section) => ({
        reportId: report.id,
        section,
        content: (
          importedContent !== null
            ? importedContent.sections[section]
            : blankSections[section]
        ) as unknown as Record<string, unknown>,
      }))
    );

    if (sourceUpload) {
      try {
        const { persistReportSourceDocx } = await import("@/lib/reports/persist-source-docx");
        await persistReportSourceDocx({
          reportId: report.id,
          buffer: sourceUpload.buffer,
          filename: sourceUpload.filename,
          uploadedById: user.id,
        });
      } catch {
        await db.delete(reports).where(eq(reports.id, report.id));
        return NextResponse.json(
          { error: "Could not save the uploaded file. Please try again." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ id: report.id, report });
  } catch (e) {
    if (isPostgresUniqueViolation(e)) {
      return NextResponse.json({ error: DUPLICATE_DEVIATION_NO_ERROR }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create report" }, { status: 500 });
  }
}
