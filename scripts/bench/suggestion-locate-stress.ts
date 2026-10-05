/**
 * Time validateSuggestionLocate / merge for every open ai_fix on a report.
 * Catches alignBlocks-style hangs (use BENCH_LOCATE_TIMEOUT_MS).
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { closeDbConnections } from "@/db/connection";
import { comments as commentsTable, reports } from "@/db/schema";
import { mergeSectionForType, getDocumentType } from "@/lib/document-types";
import { isLiveWorkspaceComment } from "@/lib/comments/slim-workspace-comments";
import { loadReportSubtables } from "@/lib/reports/bundle";
import { validateSuggestionLocate } from "@/lib/suggestions/validate-suggestion";
import type { CommentRecord } from "@/types/report";
import type { SectionType } from "@/db/schema";

loadEnv({ path: path.join(process.cwd(), ".env") });

const reportId = process.argv[2];
const timeoutMs = Number(process.env.BENCH_LOCATE_TIMEOUT_MS ?? 5000);

if (!reportId) {
  console.error("usage: tsx --env-file=.env scripts/bench/suggestion-locate-stress.ts <reportId>");
  process.exit(1);
}

function withTimeout<T>(label: string, ms: number, fn: () => T): Promise<{ ms: number; value?: T; timedOut: boolean }> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const timer = setTimeout(() => resolve({ ms: ms, timedOut: true }), ms);
    try {
      const value = fn();
      clearTimeout(timer);
      resolve({ ms: performance.now() - t0, value, timedOut: false });
    } catch (e) {
      clearTimeout(timer);
      console.error(`${label} threw:`, (e as Error).message);
      resolve({ ms: performance.now() - t0, timedOut: false });
    }
  });
}

async function main() {
  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) throw new Error(`not found: ${reportId}`);

  const sub = await loadReportSubtables(reportId);
  const def = getDocumentType(report.documentType);
  const sections: Record<string, unknown> = {};
  for (const section of def.sections.filter((s) => !s.virtual)) {
    const row = sub.sections.find((r) => r.section === section.key);
    sections[section.key] = row
      ? mergeSectionForType(report.documentType, section.key, row.content)
      : section.emptyContent;
  }

  const allRows = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.reportId, reportId));

  const open: CommentRecord[] = allRows
    .filter(
      (c) => isLiveWorkspaceComment(c) && c.kind === "ai_fix" && c.status === "open" && c.section
    )
    // Same shape the bundle sends the browser: timestamps as ISO strings.
    .map((c) => JSON.parse(JSON.stringify(c)) as CommentRecord);

  console.log(`report ${report.documentNo} (${report.documentType}) open ai_fix: ${open.length} timeoutMs=${timeoutMs}`);

  let hung = 0;
  let slow = 0;
  for (const comment of open) {
    const section = comment.section as SectionType;
    const content = sections[section];
    const label = `${section} comment=${comment.id.slice(0, 8)} len=${comment.content.length}`;
    const result = await withTimeout(label, timeoutMs, () =>
      validateSuggestionLocate(comment, section, content)
    );
    if (result.timedOut) {
      hung += 1;
      console.log(`TIMEOUT  ${label}`);
      continue;
    }
    const status = result.value?.locateStatus ?? "?";
    const merge = result.value?.mergeStatus ?? "-";
    const line = `${result.ms.toFixed(0)}ms  ${status} merge=${merge}  ${label}`;
    if (result.ms >= 200) slow += 1;
    console.log(line);
  }

  console.log(`\ndone: hung=${hung} slow(>=200ms)=${slow}`);
  await closeDbConnections();
  if (hung > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
