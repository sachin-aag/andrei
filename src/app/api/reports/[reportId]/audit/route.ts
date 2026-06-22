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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { reportId } = await params;

  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
