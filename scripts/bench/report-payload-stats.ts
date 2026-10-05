/** One-off stats for hang diagnosis; not wired in package.json. */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { closeDbConnections } from "@/db/connection";
import { comments, reportSections, reports } from "@/db/schema";
import { isLiveWorkspaceComment } from "@/lib/comments/slim-workspace-comments";
import { getWorkspaceSections } from "@/lib/document-types";

loadEnv({ path: path.join(process.cwd(), ".env") });

const reportId = process.argv[2];
if (!reportId) {
  console.error("usage: tsx --env-file=.env scripts/bench/report-payload-stats.ts <reportId>");
  process.exit(1);
}

async function main() {
  const [row] = await db
    .select({ documentNo: reports.documentNo, documentType: reports.documentType })
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!row) throw new Error(`not found: ${reportId}`);

  const secs = await db
    .select({
      section: reportSections.section,
      len: sql<number>`length(${reportSections.content}::text)`,
    })
    .from(reportSections)
    .where(eq(reportSections.reportId, reportId));

  const comm = await db
    .select({
      status: comments.status,
      kind: comments.kind,
      len: sql<number>`length(${comments.content})`,
    })
    .from(comments)
    .where(eq(comments.reportId, reportId));

  const live = comm.filter((c) => isLiveWorkspaceComment(c));
  const order = getWorkspaceSections(row.documentType).map((s) => s.key);
  const byKey = new Map(secs.map((s) => [s.section, Number(s.len)]));
  const afterScope = order.slice(order.indexOf("elr_scope") + 1, order.indexOf("elr_scope") + 4);

  console.log(JSON.stringify({
    documentNo: row.documentNo,
    documentType: row.documentType,
    sectionCount: secs.length,
    sectionCharsTotal: secs.reduce((a, s) => a + Number(s.len), 0),
    largestSections: [...secs]
      .sort((a, b) => Number(b.len) - Number(a.len))
      .slice(0, 10)
      .map((s) => ({ section: s.section, chars: Number(s.len) })),
    afterElrScope: afterScope.map((k) => ({ section: k, chars: byKey.get(k) ?? 0 })),
    comments: {
      total: comm.length,
      liveWorkspace: live.length,
      liveChars: live.reduce((a, c) => a + Number(c.len), 0),
      openAi: comm.filter((c) => c.kind?.startsWith("ai_") && c.status === "open").length,
      resolvedAi: comm.filter((c) => c.kind?.startsWith("ai_") && c.status === "resolved").length,
    },
  }, null, 2));

  await closeDbConnections();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
