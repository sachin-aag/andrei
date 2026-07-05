import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/auth/roles";
import { canViewReport } from "@/lib/reports/access";
import { buildCompleteRecordExportZip } from "@/lib/reports/complete-export";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { reports } from "@/db/schema";
import {
  listReportManagerIds,
  withAssignedManagerIds,
} from "@/lib/reports/managers";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;

  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const managerIds = await listReportManagerIds(reportId);
  const reportWithManagers = withAssignedManagerIds(report, managerIds);
  if (!canViewReport(user, reportWithManagers)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const bundle = await buildCompleteRecordExportZip(reportId, {
    includeAuditTrail: isAdminRole(user.role),
  });
  if (!bundle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const safeDev = (bundle.deviationNo || "report").replace(/[^a-zA-Z0-9_\-/]/g, "_");
  const filename = `Complete_Record_${safeDev.replace(/\//g, "-")}.zip`;
  return new NextResponse(new Uint8Array(bundle.buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
