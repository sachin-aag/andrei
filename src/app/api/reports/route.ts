import { NextResponse } from "next/server";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reportManagers, reports, reportSections } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import {
  DUPLICATE_DOCUMENT_NO_ERROR,
  isDocumentNoTaken,
  isPostgresUniqueViolation,
  normalizeDocumentNo,
} from "@/lib/reports/document-no";
import { seedBlankReportSections } from "@/lib/reports/seed-blank-report-sections";
import { getDocumentType, getSeedableSections } from "@/lib/document-types";
import { auditActorFromUser, recordAuditEvent, recordSectionVersion } from "@/lib/audit";
import {
  insertReportManagers,
  listReportManagerIdsByReportIds,
  normalizeAssignedManagerIds,
  primaryAssignedManagerId,
  validateAssignedManagerIds,
  withAssignedManagerIds,
} from "@/lib/reports/managers";
import { activeReportsFilter } from "@/lib/reports/tombstone";

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
        .where(and(eq(reports.authorId, user.id), activeReportsFilter()))
        .orderBy(desc(reports.updatedAt));
      break;
    case "manager":
      rows = await db
        .select()
        .from(reports)
        .where(
          and(
            activeReportsFilter(),
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
        .where(activeReportsFilter())
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

const createSchema = z.object({
  documentType: z
    .enum(["investigation_report", "design_verification"])
    .default("investigation_report"),
  documentNo: z.string().min(1).optional(),
  deviationNo: z.string().min(1).optional(), // alias for investigation
  assignedManagerId: z.string().nullable().optional(),
  assignedManagerIds: z.array(z.string()).optional(),
});

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

    const parse = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parse.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const documentType = parse.data.documentType;
    const def = getDocumentType(documentType);
    const rawDocumentNo = parse.data.documentNo ?? parse.data.deviationNo;
    const assignedManagerIds = parse.data.assignedManagerIds
      ? normalizeAssignedManagerIds(parse.data.assignedManagerIds)
      : normalizeAssignedManagerIds([parse.data.assignedManagerId ?? null]);

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

    const validation = await validateAssignedManagerIds(assignedManagerIds);
    if (!validation.ok) {
      return NextResponse.json(
        { error: "One or more selected reviewers are not managers" },
        { status: 400 }
      );
    }

    const assignedManagerId = primaryAssignedManagerId(assignedManagerIds);
    const blankSections = seedBlankReportSections(documentType);
    const seedable = getSeedableSections(documentType);
    const [report] = await db
      .insert(reports)
      .values({
        documentType,
        documentNo: finalDocumentNo,
        metadata: def.defaultMetadata,
        authorId: user.id,
        assignedManagerId,
      })
      .returning();

    if (!report) {
      throw new Error("insert(reports).returning() returned no row");
    }
    createdReportId = report.id;
    await insertReportManagers(report.id, assignedManagerIds);

    await db.insert(reportSections).values(
      seedable.map((section) => ({
        reportId: report.id,
        section: section.key,
        content: (blankSections[section.key] ?? {}) as Record<string, unknown>,
      }))
    );

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
