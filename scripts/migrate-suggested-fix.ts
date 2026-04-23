/**
 * Convert criteria_evaluations.suggested_fix from text to jsonb
 * { anchorText, replacementText }, preserving any existing string content as
 * { anchorText: "", replacementText: <old> }. Idempotent.
 *
 *   npm run db:migrate-suggested-fix
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (.env.local or .env)");
  process.exit(1);
}

const sql = neon(url);

async function main() {
  const rows = await sql`
    SELECT data_type
    FROM information_schema.columns
    WHERE table_name = 'criteria_evaluations'
      AND column_name = 'suggested_fix'
  `;
  const current = rows[0]?.data_type as string | undefined;
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
  await sql`ALTER TABLE criteria_evaluations ALTER COLUMN suggested_fix DROP DEFAULT`;
  await sql`
    ALTER TABLE criteria_evaluations
    ALTER COLUMN suggested_fix TYPE jsonb
    USING jsonb_build_object(
      'anchorText', '',
      'replacementText', COALESCE(suggested_fix, '')
    )
  `;
  await sql`
    ALTER TABLE criteria_evaluations
    ALTER COLUMN suggested_fix
    SET DEFAULT '{"anchorText":"","replacementText":""}'::jsonb
  `;
  await sql`ALTER TABLE criteria_evaluations ALTER COLUMN suggested_fix SET NOT NULL`;
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
