import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleWorkflowSignRequest } from "@/lib/audit/workflow-handler";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "manager") {
    return NextResponse.json(
      { error: "Only managers can return feedback" },
      { status: 403 }
    );
  }
  const { reportId } = await params;

  return handleWorkflowSignRequest(req, reportId, {
    user,
    reportId,
    meaning: "rejection",
    newStatus: "feedback",
    auditAction: "report_feedback",
    forbiddenMessage: "Only managers can return feedback",
    authorize: (u) => u.role === "manager",
  });
}
