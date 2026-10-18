import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { loadAccessibleReport } from "@/lib/ai/chat/access";
import { softDeleteStatedFact } from "@/lib/ai/chat/stated-fact-store";
import { auditActorFromUser } from "@/lib/audit";
import { canSaveReportSection } from "@/lib/reports/access";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ reportId: string; factId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reportId, factId } = await params;
  const access = await loadAccessibleReport(reportId, user);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canSaveReportSection(user, access.report)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const removed = await softDeleteStatedFact({
    reportId,
    factId,
    actor: auditActorFromUser(user),
  });
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
