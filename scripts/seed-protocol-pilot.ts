/**
 * Seed the verification-protocol + test-report pilot (idempotent).
 *
 *   pnpm seed-protocol-pilot
 *
 * Writes 790-00134 (protocol) and 790-00134R (test report) for the first
 * active engineer. Ledger is built from committed pdftotext fixtures.
 * Upload the three source PDFs in the UI if evidence jump is needed.
 */
import { config } from "dotenv";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { reports, reportSections, workspaceUsers } from "../src/db/schema";
import type { DocumentType } from "../src/db/schema";
import { buildLedger } from "../src/lib/design-inputs/build-ledger";
import {
  readPlanFixture,
  readProtocolFixture,
  readSrsFixture,
} from "../src/lib/design-inputs/read-fixtures";
import { seedBlankReportSections } from "../src/lib/reports/seed-blank-report-sections";

const shellDatabaseUrl = process.env.DATABASE_URL;
config({ path: ".env" });
config({ path: ".env.local", override: true });
if (shellDatabaseUrl) process.env.DATABASE_URL = shellDatabaseUrl;

const PROTOCOL_NO = "790-00134";
const TEST_REPORT_NO = "790-00134R";

async function upsertReport(opts: {
  authorId: string;
  documentType: DocumentType;
  documentNo: string;
  metadata: Record<string, unknown>;
  content: Record<string, unknown>;
}): Promise<string> {
  const [existing] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.authorId, opts.authorId),
        eq(reports.documentType, opts.documentType),
        eq(reports.documentNo, opts.documentNo),
        isNull(reports.deletedAt)
      )
    )
    .limit(1);

  const reportId = existing?.id ?? createId();
  if (!existing) {
    await db.insert(reports).values({
      id: reportId,
      documentType: opts.documentType,
      documentNo: opts.documentNo,
      authorId: opts.authorId,
      status: "draft",
      metadata: opts.metadata,
    });
  } else {
    await db
      .update(reports)
      .set({ metadata: opts.metadata, updatedAt: new Date() })
      .where(eq(reports.id, reportId));
  }

  for (const [section, sectionContent] of Object.entries(opts.content)) {
    const [row] = await db
      .select({ id: reportSections.id })
      .from(reportSections)
      .where(
        and(
          eq(reportSections.reportId, reportId),
          eq(reportSections.section, section)
        )
      )
      .limit(1);
    if (row) {
      await db
        .update(reportSections)
        .set({
          content: sectionContent as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(reportSections.id, row.id));
    } else {
      await db.insert(reportSections).values({
        reportId,
        section,
        content: sectionContent as Record<string, unknown>,
      });
    }
  }

  return reportId;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const engineers = await db
    .select({ id: workspaceUsers.id, email: workspaceUsers.email })
    .from(workspaceUsers)
    .where(
      and(eq(workspaceUsers.role, "engineer"), isNull(workspaceUsers.deactivatedAt))
    );
  const engineer =
    engineers.find((row) => row.email.endsWith("@convergentdental.com")) ??
    engineers[0];
  if (!engineer) {
    throw new Error(
      "No active engineer user — create one at @convergentdental.com before seeding."
    );
  }

  const ledger = buildLedger({
    srsText: readSrsFixture(),
    planText: readPlanFixture(),
    protocolText: readProtocolFixture(),
  });

  const protocolContent = seedBlankReportSections("verification_protocol");
  protocolContent.sources = {
    protocolNo: PROTOCOL_NO,
    protocolRev: "V",
    srsNo: "822-00007",
    srsRev: "AC",
    planNo: "790-00155",
    planRev: "X",
  };
  protocolContent.design_inputs = ledger;
  protocolContent.findings = { items: [] };
  protocolContent.modification_register = { rows: [] };

  const protocolId = await upsertReport({
    authorId: engineer.id,
    documentType: "verification_protocol",
    documentNo: PROTOCOL_NO,
    metadata: { revision: "V" },
    content: protocolContent,
  });

  const testReportContent = seedBlankReportSections("verification_test_report");
  testReportContent.design_inputs = ledger;

  const testReportId = await upsertReport({
    authorId: engineer.id,
    documentType: "verification_test_report",
    documentNo: TEST_REPORT_NO,
    metadata: {
      revision: "U",
      productName: "",
      projectName: "",
      dhfIndex: "",
      projectLeader: "",
      ecoDco: "",
      sourceProtocolReportId: protocolId,
    },
    content: testReportContent,
  });

  const live = ledger.requirements.filter((r) => r.removedInRev === null).length;
  console.log(
    `Seeded verification_protocol ${PROTOCOL_NO} as ${protocolId} for ${engineer.email}`
  );
  console.log(
    `Seeded verification_test_report ${TEST_REPORT_NO} as ${testReportId}`
  );
  console.log(`Live requirements: ${live}; blocks: ${ledger.blocks.length}`);
  console.log(
    "Upload 822-00007, 790-00155, and 790-00134 PDFs on the protocol report if evidence jump is needed."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
