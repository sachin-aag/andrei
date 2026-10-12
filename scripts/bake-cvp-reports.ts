/**
 * Persist CVP section content after mergeSection (on-read upgrades + normalize).
 *
 * Usage:
 *   DATABASE_URL=... pnpm exec tsx scripts/bake-cvp-reports.ts [reportId ...]
 *   (omit ids to bake every non-deleted cleaning_verification_protocol)
 */
import { createId } from "@paralleldrive/cuid2";
import pg from "pg";
import { getWorkspaceSections, mergeSectionForType } from "@/lib/document-types";

const reportIds = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Set DATABASE_URL");
  process.exit(1);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

async function main() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  let ids = reportIds;
  if (ids.length === 0) {
    const { rows } = await client.query<{ id: string; document_no: string }>(
      `SELECT id, document_no FROM reports
       WHERE document_type = 'cleaning_verification_protocol' AND deleted_at IS NULL
       ORDER BY document_no`
    );
    ids = rows.map((r) => r.id);
    console.log(
      "Reports:",
      rows.map((r) => `${r.document_no} (${r.id})`).join(", ") || "(none)"
    );
  }

  const sectionKeys = getWorkspaceSections("cleaning_verification_protocol").map(
    (s) => s.key
  );

  for (const reportId of ids) {
    const meta = await client.query<{ document_no: string }>(
      `SELECT document_no FROM reports WHERE id = $1`,
      [reportId]
    );
    if (meta.rows.length === 0) {
      console.error(`Unknown report ${reportId}`);
      process.exit(1);
    }
    console.log(`\n=== ${meta.rows[0].document_no} (${reportId}) ===`);

    const { rows: sections } = await client.query<{
      id: string;
      section: string;
      content: unknown;
    }>(
      `SELECT id, section, content FROM report_sections WHERE report_id = $1`,
      [reportId]
    );

    let updated = 0;
    let unchanged = 0;
    for (const key of sectionKeys) {
      const row = sections.find((s) => s.section === key);
      const raw = row?.content ?? {};
      const merged = mergeSectionForType("cleaning_verification_protocol", key, raw);
      if (!row) {
        await client.query(
          `INSERT INTO report_sections (id, report_id, section, content, updated_at)
           VALUES ($4, $1, $2, $3::jsonb, now())`,
          [reportId, key, stableJson(merged), createId()]
        );
        console.log(`  + inserted ${String(key)}`);
        updated++;
        continue;
      }
      if (stableJson(row.content) === stableJson(merged)) {
        unchanged++;
        continue;
      }
      await client.query(
        `UPDATE report_sections SET content = $1::jsonb, updated_at = now() WHERE id = $2`,
        [stableJson(merged), row.id]
      );
      console.log(`  ~ updated ${String(key)}`);
      updated++;
    }

    await client.query(`UPDATE reports SET updated_at = now() WHERE id = $1`, [reportId]);
    console.log(`  sections: ${updated} written, ${unchanged} unchanged`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
