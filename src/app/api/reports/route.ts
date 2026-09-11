import { NextResponse, after } from "next/server";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  documentTypeEnum,
  reportManagers,
  reports,
  reportSections,
  type DocumentType,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getCustomerPack } from "@/lib/customers/packs";
import {
  docxBufferToImportedReportContent,
  type ImportedReportContent,
} from "@/lib/import/docx-to-sections";
import { readDocxUpload } from "@/lib/import/docx-upload";
import {
  DUPLICATE_DOCUMENT_NO_ERROR,
  isDocumentNoTaken,
  isPostgresUniqueViolation,
  normalizeDocumentNo,
} from "@/lib/reports/document-no";
import {
  investigationMetadataFromImport,
  sectionRowsForCreate,
} from "@/lib/reports/create-report-from-docx";
import { persistImportedWordComments } from "@/lib/reports/persist-imported-word-comments";
import { persistReportSourceDocx } from "@/lib/reports/persist-source-docx";
import {
  getDocumentType,
  isDocumentTypeEnabled,
  isWordImportAvailable,
  wordImportFor,
} from "@/lib/document-types";
import {
  docxBufferToGenericDocument,
  GenericDocxImportError,
  type GenericImportedDocument,
} from "@/lib/import/docx-to-generic-document";
import { auditActorFromUser, recordAuditEvent, recordSectionVersion } from "@/lib/audit";
import {
  flushLangfuseTraces,
  observeWork,
  setRouteObservationIO,
  withPropagatedAttributes,
} from "@/lib/observability/langfuse";
import { assignedManagerIdsWithHiddenExpert } from "@/lib/reports/ensure-hidden-expert-reviewer";
import {
  insertReportManagers,
  listReportManagerIdsByReportIds,
  managerIdsFromFormData,
  normalizeAssignedManagerIds,
  primaryAssignedManagerId,
  validateAssignedManagerIds,
  withAssignedManagerIds,
} from "@/lib/reports/managers";
import { visibleReportsFilter } from "@/lib/reports/tombstone";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let rows;
  switch (user.role) {
    case "engineer":
      rows = await db
        .select()
        .from(reports)
        .where(and(eq(reports.authorId, user.id), visibleReportsFilter()))
        .orderBy(desc(reports.updatedAt));
      break;
    case "manager":
      rows = await db
        .select()
        .from(reports)
        .where(
          and(
            visibleReportsFilter(),
            or(
              eq(reports.assignedManagerId, user.id),
              sql`exists (
              select 1 from ${reportManagers}
              where ${reportManagers.reportId} = ${reports.id}
              and ${reportManagers.managerId} = ${user.id}
            )`,
              eq(reports.status, "submitted"),
              eq(reports.status, "in_review")
            )
          )
        )
        .orderBy(desc(reports.updatedAt));
      break;
    case "qa":
      rows = await db
        .select()
        .from(reports)
        .where(visibleReportsFilter())
        .orderBy(desc(reports.updatedAt));
      break;
    case "admin":
      return NextResponse.json(
        { error: "Admins manage users from the admin console." },
        { status: 403 }
      );
    default: {
      const exhaustive: never = user.role;
      return exhaustive;
    }
  }

  const managerIdsByReportId = await listReportManagerIdsByReportIds(
    rows.map((row) => row.id)
  );
  const rowsWithManagers = rows.map((row) =>
    withAssignedManagerIds(row, managerIdsByReportId.get(row.id) ?? [])
  );

  return NextResponse.json({ reports: rowsWithManagers });
}

const DOCUMENT_TYPE_VALUES = documentTypeEnum.enumValues;

const createSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPE_VALUES).default("investigation_report"),
  documentNo: z.string().min(1).optional(),
  deviationNo: z.string().min(1).optional(), // alias for investigation
  assignedManagerId: z.string().nullable().optional(),
  assignedManagerIds: z.array(z.string()).optional(),
});

function documentTypeFromForm(value: FormDataEntryValue | null): DocumentType {
  if (
    typeof value === "string" &&
    (DOCUMENT_TYPE_VALUES as readonly string[]).includes(value)
  ) {
    return value as DocumentType;
  }
  return "investigation_report";
}

function wordImportDocumentTypeError(documentType: DocumentType): string | null {
  const kind = wordImportFor(getDocumentType(documentType)).kind;
  switch (kind) {
    case "none":
      return "Word import is not supported for this document type.";
    case "investigation":
    case "generic_body":
      return null;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
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

    let documentType: DocumentType;
    let rawDocumentNo: string | undefined;
    let assignedManagerIds: string[];
    let importedContent: ImportedReportContent | null = null;
    let genericImported: GenericImportedDocument | null = null;
    let sourceUpload: { buffer: Buffer; filename: string } | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      documentType = documentTypeFromForm(form.get("documentType"));
      rawDocumentNo = String(
        form.get("documentNo") ?? form.get("deviationNo") ?? ""
      ).trim();
      assignedManagerIds = managerIdsFromFormData(form);
      const file = form.get("file");
      const hasFile = file instanceof File && file.size > 0;

      if (hasFile && file instanceof File) {
        if (!isWordImportAvailable(documentType)) {
          return NextResponse.json(
            {
              error: wordImportDocumentTypeError(documentType) ??
                "Word import is not enabled for this workspace.",
            },
            { status: 400 }
          );
        }
        const typeError = wordImportDocumentTypeError(documentType);
        if (typeError) {
          return NextResponse.json({ error: typeError }, { status: 400 });
        }
        try {
          const buf = await readDocxUpload(file);
          sourceUpload = { buffer: buf, filename: file.name };
          const kind = wordImportFor(getDocumentType(documentType)).kind;
          after(flushLangfuseTraces);
          const parsed = await withPropagatedAttributes(
            {
              userId: user.id,
              traceName: "word-import",
              tags: ["word-import", documentType],
              metadata: { documentType, filename: file.name },
            },
            () =>
              observeWork(
                "word-import",
                async (): Promise<{
                  importedContent: ImportedReportContent | null;
                  genericImported: GenericImportedDocument | null;
                }> => {
                  setRouteObservationIO({
                    input: { documentType, filename: file.name },
                  });
                  switch (kind) {
                    case "investigation":
                      return {
                        importedContent: await docxBufferToImportedReportContent(buf),
                        genericImported: null,
                      };
                    case "generic_body":
                      return {
                        importedContent: null,
                        genericImported: await docxBufferToGenericDocument(buf),
                      };
                    case "none":
                      return { importedContent: null, genericImported: null };
                    default: {
                      const exhaustive: never = kind;
                      return exhaustive;
                    }
                  }
                }
              )
          );
          importedContent = parsed.importedContent;
          genericImported = parsed.genericImported;
          if (kind === "none") {
            return NextResponse.json(
              { error: "Word import is not supported for this document type." },
              { status: 400 }
            );
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : "";
          if (e instanceof GenericDocxImportError) {
            return NextResponse.json({ error: e.message }, { status: 400 });
          }
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
      documentType = parse.data.documentType;
      rawDocumentNo = parse.data.documentNo ?? parse.data.deviationNo;
      assignedManagerIds = parse.data.assignedManagerIds
        ? normalizeAssignedManagerIds(parse.data.assignedManagerIds)
        : normalizeAssignedManagerIds([parse.data.assignedManagerId ?? null]);
    }

    if (!isDocumentTypeEnabled(documentType, getCustomerPack())) {
      return NextResponse.json(
        {
          error: `${getDocumentType(documentType).label} is not enabled for this workspace.`,
        },
        { status: 400 }
      );
    }
    const def = getDocumentType(documentType);
    const finalDocumentNo = normalizeDocumentNo(rawDocumentNo ?? "");

    if (!finalDocumentNo) {
      return NextResponse.json(
        { error: `${def.documentNoLabel} is required` },
        { status: 400 }
      );
    }

    if (await isDocumentNoTaken(finalDocumentNo, user.id, documentType)) {
      return NextResponse.json({ error: DUPLICATE_DOCUMENT_NO_ERROR }, { status: 409 });
    }

    assignedManagerIds = await assignedManagerIdsWithHiddenExpert(
      assignedManagerIds
    );
    const validation = await validateAssignedManagerIds(assignedManagerIds);
    if (!validation.ok) {
      return NextResponse.json(
        { error: "One or more selected reviewers are not managers" },
        { status: 400 }
      );
    }

    const assignedManagerId = primaryAssignedManagerId(assignedManagerIds);
    const metadata =
      importedContent && documentType === "investigation_report"
        ? investigationMetadataFromImport(importedContent)
        : genericImported
          ? {
              importWarnings: genericImported.warnings,
              importedFromFilename: sourceUpload?.filename,
            }
          : def.defaultMetadata;
    const [report] = await db
      .insert(reports)
      .values({
        documentType,
        documentNo: finalDocumentNo,
        metadata,
        authorId: user.id,
        assignedManagerId,
        ...(importedContent?.header.date
          ? { date: importedContent.header.date }
          : {}),
      })
      .returning();

    if (!report) {
      throw new Error("insert(reports).returning() returned no row");
    }
    createdReportId = report.id;
    await insertReportManagers(report.id, assignedManagerIds);

    await db.insert(reportSections).values(
      sectionRowsForCreate(
        documentType,
        importedContent,
        genericImported ? { narrative: genericImported.narrative } : null
      ).map((row) => ({
        reportId: report.id,
        section: row.section,
        content: row.content,
      }))
    );

    if (sourceUpload) {
      try {
        if (importedContent) {
          await persistImportedWordComments(report.id, importedContent);
        }
        await persistReportSourceDocx({
          reportId: report.id,
          buffer: sourceUpload.buffer,
          filename: sourceUpload.filename,
          uploadedById: user.id,
        });
      } catch {
        await db.delete(reports).where(eq(reports.id, report.id));
        createdReportId = null;
        return NextResponse.json(
          { error: "Could not save the uploaded file. Please try again." },
          { status: 500 }
        );
      }
    }

    const actor = auditActorFromUser(user);
    await recordAuditEvent({
      actor,
      action: "report_created",
      entityType: "report",
      entityId: report.id,
      reportId: report.id,
      summary: `Created report ${finalDocumentNo}`,
      newValue: {
        documentType,
        documentNo: finalDocumentNo,
        authorId: user.id,
        assignedManagerId,
        assignedManagerIds,
      },
    });

    const sectionRows = await db
      .select()
      .from(reportSections)
      .where(eq(reportSections.reportId, report.id));

    for (const sectionRow of sectionRows) {
      await recordSectionVersion({
        actor,
        reportId: report.id,
        sectionId: sectionRow.id,
        section: sectionRow.section,
        previousContent: {},
        newContent: sectionRow.content,
        forceSnapshot: true,
      });
    }

    return NextResponse.json({
      id: report.id,
      report: withAssignedManagerIds(report, assignedManagerIds),
    });
  } catch (e) {
    const duplicateDocumentNo = isPostgresUniqueViolation(e);
    if (!duplicateDocumentNo) {
      console.error("Failed to create report", {
        reportId: createdReportId,
        error: e,
      });
    }
    if (createdReportId) {
      try {
        await db.delete(reports).where(eq(reports.id, createdReportId));
      } catch (cleanupError) {
        console.error("Failed to clean up partial report creation", {
          reportId: createdReportId,
          error: cleanupError,
        });
      }
    }
    if (duplicateDocumentNo) {
      return NextResponse.json({ error: DUPLICATE_DOCUMENT_NO_ERROR }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create report" }, { status: 500 });
  }
}
