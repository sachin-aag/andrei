import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { reportSourceDocx } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";

export const runtime = "nodejs";

function contentDispositionFilename(name: string): string {
  const safe = name.replace(/[\r\n"]/g, "_").trim() || "document.docx";
  return `attachment; filename="${safe}"`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  const { reportId } = await params;
  const access = await requireReportAccess(reportId, user);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const [row] = await db
    .select()
    .from(reportSourceDocx)
    .where(eq(reportSourceDocx.reportId, reportId));

  if (!row) {
    return NextResponse.json(
      { error: "No source DOCX stored for this report." },
      { status: 404 }
    );
  }

  const body = row.data instanceof Buffer ? row.data : Buffer.from(row.data);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Disposition": contentDispositionFilename(row.filename),
    },
  });
}
