import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import {
  listAuditEvents,
  listReportSignatures,
  listSectionVersions,
  verifyAuditChain,
} from "@/lib/audit";

function canViewAudit(
  user: { id: string; role: string },
  report: { authorId: string; assignedManagerId: string | null }
) {
  if (user.role === "admin" || user.role === "manager") return true;
  return user.id === report.authorId;
}

export async function GET(
  _req: Request,
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
  if (!canViewAudit(user, report)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [events, signatures, versions, chain] = await Promise.all([
    listAuditEvents({ reportId, limit: 1000 }),
    listReportSignatures(reportId),
    listSectionVersions(reportId),
    verifyAuditChain(),
  ]);

  return NextResponse.json({
    events,
    signatures,
    sectionVersions: versions,
    chainVerification: chain,
  });
}
