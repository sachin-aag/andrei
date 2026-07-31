import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listActiveAttachments } from "@/lib/attachments/list-active";
import { requireReportAccess } from "@/lib/reports/require-report-access";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const currentUser = await getCurrentUser();
  const { reportId } = await params;
  const access = await requireReportAccess(reportId, currentUser);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const attachments = await listActiveAttachments(reportId);
  return NextResponse.json({ attachments });
}
