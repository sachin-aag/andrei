import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reports, reportSections } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { generateReportDocx } from "@/lib/export/generate-docx";

export const runtime = "nodejs";

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

  const sectionRows = await db
    .select()
    .from(reportSections)
    .where(eq(reportSections.reportId, reportId));

  const buffer = await generateReportDocx({
    report,
    sections: sectionRows.map((r) => ({
      id: r.id,
      reportId: r.reportId,
      section: r.section,
      content: r.content,
      updatedAt: r.updatedAt.toISOString(),
    })),
  });

  const safeDev = (report.deviationNo || "report").replace(/[^a-zA-Z0-9_\-/]/g, "_");
  const filename = `Investigation_Report_${safeDev.replace(/\//g, "-")}.docx`;
  const body = new Uint8Array(buffer);
  return new NextResponse(body, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
