/**
 * Convert criteria_evaluations.suggested_fix from text to jsonb
 * { anchorText, replacementText }, preserving any existing string content as
 * { anchorText: "", replacementText: <old> }. Idempotent.
 *
 *   npm run db:migrate-suggested-fix
 */
import { createScriptPool } from "./db-client";

async function main() {
  const pool = createScriptPool();
  try {
    const { rows } = await pool.query<{ data_type: string }>(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_name = 'criteria_evaluations'
        AND column_name = 'suggested_fix'
    `);
    const current = rows[0]?.data_type;
    if (!current) {
      console.error(
        "criteria_evaluations.suggested_fix column not found; nothing to migrate."
      );
      process.exit(1);
    }

    if (current === "jsonb") {
      console.log("suggested_fix is already jsonb. Nothing to do.");
      return;
    }

    console.log(`Converting suggested_fix from ${current} to jsonb…`);
    await pool.query(
      "ALTER TABLE criteria_evaluations ALTER COLUMN suggested_fix DROP DEFAULT"
    );
    await pool.query(`
      ALTER TABLE criteria_evaluations
      ALTER COLUMN suggested_fix TYPE jsonb
      USING jsonb_build_object(
        'anchorText', '',
        'replacementText', COALESCE(suggested_fix, '')
      )
    `);
    await pool.query(`
      ALTER TABLE criteria_evaluations
      ALTER COLUMN suggested_fix
      SET DEFAULT '{"anchorText":"","replacementText":""}'::jsonb
    `);
    await pool.query(
      "ALTER TABLE criteria_evaluations ALTER COLUMN suggested_fix SET NOT NULL"
    );
    console.log("Done.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
