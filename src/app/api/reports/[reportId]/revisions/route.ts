import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { loadAccessibleReport } from "@/lib/ai/chat/access";
import { listDocumentRevisions } from "@/lib/document-revisions/queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;
  const access = await loadAccessibleReport(reportId, user);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const revisions = await listDocumentRevisions(reportId);
  return NextResponse.json({
    revisions: revisions.map((row) => ({
      id: row.id,
      revisionNo: row.revisionNo,
      source: row.source,
      summary: row.summary,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
    })),
  });
}
