import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reportSections } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromUser, recordAuditEvent, recordSectionVersion } from "@/lib/audit";
import { snapshotAcceptedModifications } from "@/lib/design-inputs/protocol-modifications";
import { asModificationRegister } from "@/lib/document-types/verification-protocol/sections";
import { asTestReportMethods } from "@/lib/document-types/verification-test-report/sections";
import { canSaveReportSection } from "@/lib/reports/access";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { verificationTestReportMetadata } from "@/types/report";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const currentUser = await getCurrentUser();
  const { reportId } = await params;
  const access = await requireReportAccess(reportId, currentUser);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { report, user } = access;
  if (report.documentType !== "verification_test_report") {
    return NextResponse.json(
      { error: "Protocol modifications can only be pulled into a verification test report." },
      { status: 400 }
    );
  }
  if (!canSaveReportSection(user, report)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sourceProtocolReportId =
    verificationTestReportMetadata(report).sourceProtocolReportId?.trim() ?? "";
  if (!sourceProtocolReportId) {
    return NextResponse.json(
      { error: "Link a source protocol on the cover page before pulling modifications." },
      { status: 400 }
    );
  }

  const sourceAccess = await requireReportAccess(sourceProtocolReportId, user);
  if (!sourceAccess.ok) {
    return NextResponse.json(
      { error: sourceAccess.error },
      { status: sourceAccess.status }
    );
  }
  if (sourceAccess.report.documentType !== "verification_protocol") {
    return NextResponse.json(
      { error: "Linked source is not a verification protocol." },
      { status: 400 }
    );
  }

  const [registerRow] = await db
    .select()
    .from(reportSections)
    .where(
      and(
        eq(reportSections.reportId, sourceProtocolReportId),
        eq(reportSections.section, "modification_register")
      )
    );
  const snapshot = snapshotAcceptedModifications(
    sourceProtocolReportId,
    asModificationRegister(registerRow?.content),
    new Date().toISOString()
  );

  const [methodsRow] = await db
    .select()
    .from(reportSections)
    .where(
      and(
        eq(reportSections.reportId, reportId),
        eq(reportSections.section, "methods_of_measurement")
      )
    );
  const previous = asTestReportMethods(methodsRow?.content);
  const next = { ...previous, protocolModifications: snapshot };

  if (!methodsRow) {
    const [inserted] = await db
      .insert(reportSections)
      .values({
        reportId,
        section: "methods_of_measurement",
        content: next as unknown as Record<string, unknown>,
      })
      .returning();
    await recordSectionVersion({
      actor: auditActorFromUser(user),
      reportId,
      sectionId: inserted.id,
      section: "methods_of_measurement",
      previousContent: {},
      newContent: next,
    });
  } else {
    await recordSectionVersion({
      actor: auditActorFromUser(user),
      reportId,
      sectionId: methodsRow.id,
      section: "methods_of_measurement",
      previousContent: methodsRow.content,
      newContent: next,
    });
    await db
      .update(reportSections)
      .set({
        content: next as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(reportSections.id, methodsRow.id));
  }

  await recordAuditEvent({
    actor: auditActorFromUser(user),
    action: "section_updated",
    entityType: "section",
    entityId: reportId,
    reportId,
    summary: `Pulled ${snapshot.rows.length} accepted protocol modification(s)`,
    newValue: {
      sourceProtocolReportId,
      count: snapshot.rows.length,
      pulledAt: snapshot.pulledAt,
    },
  });

  return NextResponse.json({ protocolModifications: snapshot });
}
