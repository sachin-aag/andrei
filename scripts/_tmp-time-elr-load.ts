/**
 * One-off: seed an ELR sized like MJ "dev 11" and time the live bundle path.
 * Delete after use.
 */
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, reports, reportSections, workspaceUsers } from "@/db/schema";
import { getDocumentType } from "@/lib/document-types";
import { loadReportAuth, loadReportSubtables } from "@/lib/reports/bundle";
import { mergeSectionForType } from "@/lib/document-types";

const AUTHOR_EMAIL = "test.engineer@mjbiopharm.com";

function fatTable(chars: number) {
  const cell = "x".repeat(80);
  const rows = Math.max(8, Math.ceil(chars / 400));
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: Array.from({ length: rows }, (_, i) => ({
          type: "tableRow",
          content: Array.from({ length: 4 }, () => ({
            type: "tableCell",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: `${cell}-${i}` }],
              },
            ],
          })),
        })),
      },
    ],
  };
}

function fatComment(chars: number) {
  return JSON.stringify({
    criterionKey: "elr_access_control_rows",
    targetField: "table",
    tableOperation: {
      kind: "insert_rows",
      rows: Array.from({ length: Math.ceil(chars / 200) }, (_, i) => ({
        cells: [`user-${i}`, "role", "period", "x".repeat(80)],
      })),
    },
  });
}

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const value = await fn();
  console.log(`${label}: ${(performance.now() - t0).toFixed(0)}ms`);
  return value;
}

async function main() {
  const [author] = await db
    .select({ id: workspaceUsers.id })
    .from(workspaceUsers)
    .where(eq(workspaceUsers.email, AUTHOR_EMAIL));
  if (!author) throw new Error(`missing ${AUTHOR_EMAIL}`);

  const def = getDocumentType("equipment_lifecycle_report");
  const reportId = createId();
  const sizes: Record<string, number> = {
    elr_access_control: 46235,
    elr_monitoring: 29258,
    elr_system_trends: 24432,
    elr_qualification: 19252,
    elr_risk_actions: 16610,
    elr_calibration: 16115,
    elr_qms: 15116,
    elr_alarms: 14832,
    elr_csv_status: 11617,
    elr_audit_trail: 11115,
    elr_breakdowns: 10816,
    elr_conclusion: 10447,
  };

  await db.insert(reports).values({
    id: reportId,
    documentType: "equipment_lifecycle_report",
    documentNo: `local-dev11-${reportId.slice(0, 6)}`,
    authorId: author.id,
    metadata: def.defaultMetadata,
  });

  await db.insert(reportSections).values(
    def.sections
      .filter((s) => !s.virtual)
      .map((section) => {
        const empty = section.emptyContent as Record<string, unknown>;
        const chars = sizes[section.key] ?? 2000;
        return {
          reportId,
          section: section.key,
          content: {
            ...empty,
            ...(empty.table !== undefined ? { table: fatTable(chars) } : {}),
            ...(empty.narrative !== undefined
              ? {
                  narrative: {
                    type: "doc",
                    content: [
                      {
                        type: "paragraph",
                        content: [
                          {
                            type: "text",
                            text: "n".repeat(Math.min(chars, 4000)),
                          },
                        ],
                      },
                    ],
                  },
                }
              : {}),
          },
        };
      })
  );

  const commentRows = [
    ...Array.from({ length: 53 }, () => ({
      reportId,
      authorId: author.id,
      section: "elr_access_control",
      content: fatComment(16000),
      kind: "ai_fix" as const,
      status: "resolved" as const,
    })),
    ...Array.from({ length: 6 }, () => ({
      reportId,
      authorId: author.id,
      section: "elr_access_control",
      content: fatComment(8000),
      kind: "ai_fix" as const,
      status: "open" as const,
    })),
  ];
  await db.insert(comments).values(commentRows);

  console.log(`seeded ${reportId}`);

  await time("loadReportAuth", () => loadReportAuth(reportId));
  const sub = await time("loadReportSubtables", () =>
    loadReportSubtables(reportId)
  );
  const json = await time("JSON.stringify", async () =>
    JSON.stringify({
      sections: sub.sections,
      comments: sub.comments,
      evaluations: sub.evaluations,
      attachments: sub.attachments,
    })
  );
  console.log(
    `live comments=${sub.comments.length} json_kb=${(json.length / 1024).toFixed(1)}`
  );

  await time("merge all sections", async () => {
    for (const row of sub.sections) {
      mergeSectionForType(
        "equipment_lifecycle_report",
        row.section,
        row.content
      );
    }
  });

  if (process.env.KEEP_REPORT === "1") {
    console.log(`KEEP_REPORT=1 ${reportId}`);
  } else {
    await db.delete(reports).where(eq(reports.id, reportId));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
