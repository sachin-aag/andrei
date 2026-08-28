import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { loadAccessibleReport } from "@/lib/ai/chat/access";
import { diffRevisionSnapshots } from "@/lib/document-revisions/inline-diff";
import { loadRevisionSectionSnapshots } from "@/lib/document-revisions/queries";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;
  const access = await loadAccessibleReport(reportId, user);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const fromNo = Number(url.searchParams.get("from"));
  const toNo = Number(url.searchParams.get("to"));
  if (!Number.isInteger(fromNo) || !Number.isInteger(toNo) || fromNo === toNo) {
    return NextResponse.json(
      { error: "Pick two different versions." },
      { status: 400 }
    );
  }

  const loaded = await loadRevisionSectionSnapshots(reportId, [fromNo, toNo]);
  const from = loaded.find((row) => row.revisionNo === fromNo);
  const to = loaded.find((row) => row.revisionNo === toNo);
  if (!from || !to) {
    return NextResponse.json(
      { error: "Pick two different versions." },
      { status: 400 }
    );
  }

  const sections = diffRevisionSnapshots({
    documentType: access.report.documentType,
    from: from.sections,
    to: to.sections,
  });
  return NextResponse.json({
    from: fromNo,
    to: toNo,
    sections,
  });
}
