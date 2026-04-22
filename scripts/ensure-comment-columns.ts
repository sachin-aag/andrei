/**
 * Ensures comment threading / anchor columns exist (content_path, from_pos, to_pos, parent_id + FK).
 * Use when the DB was created with drizzle-kit push or an older snapshot and migrations were not applied.
 *
 *   npm run db:ensure
 *   # or: npm run db:fix-comments
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
  await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS content_path text`;
  await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS from_pos integer`;
  await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS to_pos integer`;
  await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id text`;
  try {
    await sql`ALTER TABLE comments ADD CONSTRAINT comments_parent_id_comments_id_fk FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE`;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("already exists") && !msg.includes("duplicate")) throw e;
  }
  console.log("comments: content_path, from_pos, to_pos, parent_id are present.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
