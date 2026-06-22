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

export async function GET(
  req: Request,
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
