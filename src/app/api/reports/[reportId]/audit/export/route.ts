import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import {
  exportAuditEventsCsv,
  exportAuditEventsPdf,
  listAuditEvents,
} from "@/lib/audit";

function canViewAudit(
  user: { id: string; role: string },
  report: { authorId: string; assignedManagerId: string | null }
) {
  if (user.role === "admin" || user.role === "manager") return true;
  return user.id === report.authorId;
}

export async function GET(
  req: Request,
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

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";
  const events = await listAuditEvents({ reportId, limit: 5000 });

  if (format === "pdf") {
    const pdf = await exportAuditEventsPdf(events);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="audit-trail-${report.deviationNo.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf"`,
      },
    });
  }

  const csv = await exportAuditEventsCsv(events);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-trail-${report.deviationNo.replace(/[^a-zA-Z0-9_-]/g, "_")}.csv"`,
    },
  });
}
