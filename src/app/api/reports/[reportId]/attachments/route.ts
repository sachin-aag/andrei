import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listActiveAttachments } from "@/lib/attachments/list-active";
import { startIngestForUnprocessedLinkedVaultAssets } from "@/lib/attachments/start-vault-ingest";
import { reclaimStaleIngests } from "@/lib/attachments/stale-ingest";
import { requireReportAccess } from "@/lib/reports/require-report-access";

export const runtime = "nodejs";
export const maxDuration = 300;

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

  // The documents panel polls this while ingest runs, so it is where a
  // timed-out run is first noticed and turned into a retryable failure.
  await reclaimStaleIngests(reportId);

  const attachments = await listActiveAttachments(reportId);
  // Old vault files linked before vault ingest existed stay on uploading /
  // processing with no live run. Kick them here so Add from vault is not
  // required again (those rows are hidden from the picker).
  after(() => startIngestForUnprocessedLinkedVaultAssets(attachments));
  return NextResponse.json({ attachments });
}
