import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleWorkflowSignRequest } from "@/lib/audit/workflow-handler";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;

  return handleWorkflowSignRequest(req, reportId, {
    user,
    reportId,
    meaning: "submission",
    newStatus: "submitted",
    auditAction: "report_submitted",
    forbiddenMessage: "Forbidden",
    authorize: (u, report) => u.id === report.authorId,
  });
}
