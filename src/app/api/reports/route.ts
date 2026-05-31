import { NextResponse } from "next/server";
import { desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { comments, reports, reportSections } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import type { ImportedReportContent } from "@/lib/import/docx-to-sections";
import { docxImportErrorPayload } from "@/lib/import/docx-errors";
import { readDocxUpload } from "@/lib/import/docx-upload";
import { docxBufferToImportedReportContent } from "@/lib/import/docx-to-sections";
import { persistReportSourceDocx } from "@/lib/reports/persist-source-docx";
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

async function persistImportedComments(
  reportId: string,
  importedContent: ImportedReportContent | null
) {
  if (!importedContent?.comments.length) return;

  const roots = importedContent.comments.filter(
    (comment) => !comment.parentExternalCommentId
  );
  const replies = importedContent.comments.filter(
    (comment) => comment.parentExternalCommentId
  );
  const idByExternalId = new Map<string, string>();

  for (const comment of roots) {
    const [inserted] = await db
      .insert(comments)
      .values({
        reportId,
        section: comment.section,
        authorId: "word",
        content: comment.content,
        anchorText: comment.anchorText,
        contentPath: comment.contentPath,
        fromPos: comment.fromPos,
        toPos: comment.toPos,
        kind: "word_import",
        source: "word",
        externalAuthorName: comment.externalAuthorName,
        externalAuthorInitials: comment.externalAuthorInitials,
        externalCommentId: comment.externalCommentId,
        externalCreatedAt: comment.externalCreatedAt,
        locked: true,
      })
      .returning();
    if (inserted) idByExternalId.set(comment.externalCommentId, inserted.id);
  }

  for (const comment of replies) {
    const parentId = comment.parentExternalCommentId
      ? idByExternalId.get(comment.parentExternalCommentId)
      : undefined;
    const [inserted] = await db
      .insert(comments)
      .values({
        reportId,
        parentId: parentId ?? null,
        section: comment.section,
        authorId: "word",
        content: comment.content,
        anchorText: parentId ? "" : comment.anchorText,
        contentPath: parentId ? null : comment.contentPath,
        fromPos: parentId ? null : comment.fromPos,
        toPos: parentId ? null : comment.toPos,
        kind: "word_import",
        source: "word",
        externalAuthorName: comment.externalAuthorName,
        externalAuthorInitials: comment.externalAuthorInitials,
        externalCommentId: comment.externalCommentId,
        externalCreatedAt: comment.externalCreatedAt,
        locked: true,
      })
      .returning();
    if (inserted) idByExternalId.set(comment.externalCommentId, inserted.id);
  }
}

export async function POST(req: Request) {
  let createdReportId: string | null = null;
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
          const buf = await readDocxUpload(file);
          importedContent = await docxBufferToImportedReportContent(buf);
          sourceUpload = { buffer: buf, filename: file.name };
        } catch (e) {
          const { error, status } = docxImportErrorPayload(e, { createFlow: true });
          return NextResponse.json({ error }, { status });
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
    createdReportId = report.id;

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
        await persistImportedComments(report.id, importedContent);
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
    if (createdReportId) {
      await db.delete(reports).where(eq(reports.id, createdReportId));
    }
    if (isPostgresUniqueViolation(e)) {
      return NextResponse.json({ error: DUPLICATE_DEVIATION_NO_ERROR }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create report" }, { status: 500 });
  }
}
