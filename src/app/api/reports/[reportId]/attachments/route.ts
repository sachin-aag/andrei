import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listAttachmentFolders } from "@/lib/attachments/folders";
import { listActiveAttachments } from "@/lib/attachments/list-active";
import { startIngestForUnprocessedLinkedVaultAssets } from "@/lib/attachments/start-vault-ingest";
import { reclaimStaleIngests } from "@/lib/attachments/stale-ingest";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { logWorkspaceLoadServer } from "@/lib/workspace-load-telemetry";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const started = Date.now();
  const currentUser = await getCurrentUser();
  const { reportId } = await params;
  const access = await requireReportAccess(reportId, currentUser);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const sync = new URL(req.url).searchParams.get("sync") === "1";

  // The documents panel polls this while ingest runs, so it is where a
  // timed-out *run* is first noticed and turned into a retryable failure.
  // Never-started vault leftovers have no run: reclaim leaves them, and
  // the leftover kick below starts holder ingest.
  // The first load after opening a report is read-only (`sync` omitted) so
  // opening the editor cannot kick ingest for linked vault files.
  if (sync) {
    await reclaimStaleIngests(reportId);
  }

  const [attachments, folders] = await Promise.all([
    listActiveAttachments(reportId),
    listAttachmentFolders(reportId),
  ]);
  // Old vault files linked before vault ingest existed stay on uploading /
  // processing with no live run. Kick them here so Add from vault is not
  // required again (those rows are hidden from the picker).
  if (sync) {
    after(() => startIngestForUnprocessedLinkedVaultAssets(attachments));
  }
  logWorkspaceLoadServer({
    reportId,
    stage: "attachments_get",
    t: Date.now() - started,
    extra: {
      rows: attachments.length,
      folders: folders.length,
      sync,
    },
  });
  return NextResponse.json({ attachments, folders });
}
