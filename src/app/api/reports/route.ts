import { NextResponse } from "next/server";
import { desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reports, reportSections } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import {
  createReportCreateLogger,
  databaseUrlFingerprint,
  describeErrorChain,
  isPostgresUniqueViolation,
} from "@/lib/debug/report-create-log";
import { seedBlankReportSections } from "@/lib/reports/seed-blank-report-sections";
import { REPORT_SECTION_ROW_ORDER } from "@/types/sections";
import type { ImportedReportContent } from "@/lib/import/docx-to-sections";
import {
  DUPLICATE_DEVIATION_NO_ERROR,
  isDeviationNoTaken,
  normalizeDeviationNo,
} from "@/lib/reports/deviation-no";

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
  const log = createReportCreateLogger("POST /api/reports");

  try {
    log.step("auth");
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "engineer") {
      return NextResponse.json(
        { error: "Only engineers can create reports" },
        { status: 403 }
      );
    }
    log.step("authenticated", { userId: user.id, role: user.role });

    const contentType = req.headers.get("content-type") ?? "";

    let deviationNo: string;
    let assignedManagerId: string | null;
    let importedContent: ImportedReportContent | null = null;
    let sourceUpload: { buffer: Buffer; filename: string } | null = null;

    if (contentType.includes("multipart/form-data")) {
      log.step("parse-multipart");
      const form = await req.formData();
      deviationNo = String(form.get("deviationNo") ?? "").trim();
      const mgrRaw = form.get("assignedManagerId");
      assignedManagerId =
        mgrRaw === "" || mgrRaw === null ? null : String(mgrRaw);
      const file = form.get("file");
      const hasFile = file instanceof File && file.size > 0;
      log.step("multipart-parsed", {
        deviationNo,
        assignedManagerId,
        hasFile,
        fileName: hasFile && file instanceof File ? file.name : null,
        fileSizeBytes: hasFile && file instanceof File ? file.size : 0,
      });

      if (!deviationNo) {
        return NextResponse.json({ error: "Deviation number is required" }, { status: 400 });
      }

      if (hasFile && file instanceof File) {
        try {
          const { readDocxUpload } = await import("@/lib/import/docx-upload");
          const { docxBufferToImportedReportContent } = await import(
            "@/lib/import/docx-to-sections"
          );
          log.step("docx-read-start");
          const buf = await readDocxUpload(file);
          log.step("docx-import-start", { bufferBytes: buf.byteLength });
          importedContent = await docxBufferToImportedReportContent(buf);
          sourceUpload = { buffer: buf, filename: file.name };
          log.step("docx-import-done", {
            deviationFromDocx: importedContent.header.deviationNo ?? null,
          });
        } catch (e) {
          log.fail(e, { phase: "docx-import" });
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
      log.step("parse-json");
      const parse = createSchema.safeParse(await req.json().catch(() => ({})));
      if (!parse.success) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
      }
      deviationNo = parse.data.deviationNo;
      assignedManagerId = parse.data.assignedManagerId ?? null;
      log.step("json-parsed", { deviationNo, assignedManagerId });
    }

    const importedDate = importedContent?.header.date;
    const importedOtherTools = importedContent?.header.otherTools?.trim();
    const finalDeviationNo = normalizeDeviationNo(deviationNo);

    if (!finalDeviationNo) {
      return NextResponse.json({ error: "Deviation number is required" }, { status: 400 });
    }

    log.step("check-deviation-taken", { finalDeviationNo });
    if (await isDeviationNoTaken(finalDeviationNo, user.id)) {
      return NextResponse.json({ error: DUPLICATE_DEVIATION_NO_ERROR }, { status: 409 });
    }

    log.step("insert-report");
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
    log.step("insert-report-done", { reportId: report.id });

    log.step("insert-sections", { sectionCount: REPORT_SECTION_ROW_ORDER.length });
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
    log.step("insert-sections-done", { reportId: report.id });

    if (sourceUpload) {
      try {
        const { persistReportSourceDocx } = await import("@/lib/reports/persist-source-docx");
        log.step("persist-source-docx", {
          reportId: report.id,
          filename: sourceUpload.filename,
          bufferBytes: sourceUpload.buffer.byteLength,
        });
        await persistReportSourceDocx({
          reportId: report.id,
          buffer: sourceUpload.buffer,
          filename: sourceUpload.filename,
          uploadedById: user.id,
        });
        log.step("persist-source-docx-done", { reportId: report.id });
      } catch (e) {
        log.fail(e, { phase: "persist-source-docx", reportId: report.id });
        await db.delete(reports).where(eq(reports.id, report.id));
        return NextResponse.json(
          {
            error: "Could not save the uploaded file. Please try again.",
            debugStep: log.lastStep,
            debugDb: databaseUrlFingerprint(),
          },
          { status: 500 }
        );
      }
    }

    log.step("success", { reportId: report.id });
    return NextResponse.json({ id: report.id, report });
  } catch (e) {
    log.fail(e);
    const debugDb = databaseUrlFingerprint();
    if (isPostgresUniqueViolation(e)) {
      return NextResponse.json(
        {
          error:
            "That deviation number is already in use (database unique constraint). Try a different number, or run migration 0011 if this DB still uses a global deviation_no index.",
          debugStep: log.lastStep,
          debugMessage: describeErrorChain(e),
          debugDb,
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        error: "Failed to create report",
        debugStep: log.lastStep,
        debugMessage: describeErrorChain(e),
        debugDb,
      },
      { status: 500 }
    );
  }
}
