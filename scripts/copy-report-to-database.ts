/**
 * One-off: copy a single report subgraph from one Postgres database to another.
 * Usage:
 *   SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... pnpm exec tsx scripts/copy-report-to-database.ts <reportId>
 */
import pg from "pg";

const reportId = process.argv[2];
if (!reportId) {
  console.error("Usage: copy-report-to-database.ts <reportId>");
  process.exit(1);
}

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL;
if (!sourceUrl || !targetUrl) {
  console.error("Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL");
  process.exit(1);
}

type Row = Record<string, unknown>;

async function fetchRows(client: pg.Client, table: string, where: string, params: unknown[]) {
  const { rows } = await client.query<Row>(`SELECT * FROM ${table} WHERE ${where}`, params);
  return rows;
}

const JSONB_COLUMNS: Record<string, readonly string[]> = {
  reports: ["metadata"],
  report_sections: ["content"],
  comments: [],
  chat_messages: ["parts", "metadata"],
  chat_sessions: ["metadata"],
  attachment_assets: ["metadata"],
  report_attachments: [],
  statistical_workspaces: ["worksheet"],
  document_revisions: ["metadata"],
  document_revision_sections: ["content"],
};

function serializeCell(table: string, col: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (!JSONB_COLUMNS[table]?.includes(col)) return value;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function buildInsert(table: string, row: Row): { sql: string; values: unknown[] } {
  const cols = Object.keys(row);
  const values = cols.map((c) => serializeCell(table, c, row[c]));
  const placeholders = cols.map((c, i) =>
    JSONB_COLUMNS[table]?.includes(c) ? `$${i + 1}::jsonb` : `$${i + 1}`
  );
  const sql = `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT DO NOTHING`;
  return { sql, values };
}

async function insertRows(client: pg.Client, table: string, rows: Row[]) {
  let inserted = 0;
  for (const row of rows) {
    const { sql, values } = buildInsert(table, row);
    const res = await client.query(sql, values);
    if (res.rowCount && res.rowCount > 0) inserted += res.rowCount;
  }
  return inserted;
}

async function main() {
  const source = new pg.Client({ connectionString: sourceUrl });
  const target = new pg.Client({ connectionString: targetUrl });
  await source.connect();
  await target.connect();

  const existing = await target.query(
    `SELECT id, document_no FROM reports WHERE id = $1 OR document_no = (SELECT document_no FROM reports WHERE id = $1 LIMIT 1)`,
    [reportId]
  );
  if (existing.rows.length > 0) {
    console.error("Target already has report:", existing.rows);
    process.exit(1);
  }

  const assetIds = (
    await source.query<{ asset_id: string }>(
      `SELECT DISTINCT asset_id FROM report_attachments WHERE report_id = $1 AND asset_id IS NOT NULL`,
      [reportId]
    )
  ).rows.map((r) => r.asset_id);

  const revisionIds = (
    await source.query<{ id: string }>(`SELECT id FROM document_revisions WHERE report_id = $1`, [reportId])
  ).rows.map((r) => r.id);

  const steps: { table: string; rows: Row[] }[] = [];

  if (assetIds.length > 0) {
    const assets = await source.query<Row>(
      `SELECT * FROM attachment_assets WHERE id = ANY($1::text[])`,
      [assetIds]
    );
    steps.push({ table: "attachment_assets", rows: assets.rows });
  }

  steps.push({
    table: "reports",
    rows: await fetchRows(source, "reports", "id = $1", [reportId]),
  });
  steps.push({
    table: "report_managers",
    rows: await fetchRows(source, "report_managers", "report_id = $1", [reportId]),
  });
  steps.push({
    table: "report_sections",
    rows: await fetchRows(source, "report_sections", "report_id = $1", [reportId]),
  });
  steps.push({
    table: "report_attachments",
    rows: await fetchRows(source, "report_attachments", "report_id = $1", [reportId]),
  });
  steps.push({
    table: "comments",
    rows: await fetchRows(source, "comments", "report_id = $1", [reportId]),
  });
  steps.push({
    table: "chat_sessions",
    rows: await fetchRows(source, "chat_sessions", "report_id = $1", [reportId]),
  });
  steps.push({
    table: "chat_messages",
    rows: await fetchRows(source, "chat_messages", "report_id = $1", [reportId]),
  });
  steps.push({
    table: "statistical_workspaces",
    rows: await fetchRows(source, "statistical_workspaces", "report_id = $1", [reportId]),
  });
  steps.push({
    table: "document_revisions",
    rows: await fetchRows(source, "document_revisions", "report_id = $1", [reportId]),
  });

  if (revisionIds.length > 0) {
    const revSections = await source.query<Row>(
      `SELECT * FROM document_revision_sections WHERE revision_id = ANY($1::text[])`,
      [revisionIds]
    );
    steps.push({ table: "document_revision_sections", rows: revSections.rows });
  }

  // section_content_versions and audit_events are append-only audit rows tied to
  // preview audit chains — skip for prod promotion.

  await target.query("BEGIN");
  try {
    for (const { table, rows } of steps) {
      const n = await insertRows(target, table, rows);
      console.log(`${table}: ${rows.length} source rows, ${n} inserted`);
    }
    await target.query("COMMIT");
    const verify = await target.query(
      `SELECT id, document_no, (SELECT count(*) FROM report_sections WHERE report_id = $1) AS sections FROM reports WHERE id = $1`,
      [reportId]
    );
    console.log("Verified on target:", verify.rows[0]);
  } catch (e) {
    await target.query("ROLLBACK");
    throw e;
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
