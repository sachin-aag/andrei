/**
 * Ensures comment threading, anchor, and import metadata columns exist.
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
  await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app'`;
  await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS external_author_name text`;
  await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS external_author_initials text`;
  await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS external_comment_id text`;
  await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS external_created_at timestamp with time zone`;
  await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false`;
  await sql`ALTER TYPE comment_kind ADD VALUE IF NOT EXISTS 'word_import'`;
  try {
    await sql`ALTER TABLE comments ADD CONSTRAINT comments_parent_id_comments_id_fk FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE`;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("already exists") && !msg.includes("duplicate")) throw e;
  }
  console.log("comments: threading, anchors, and import metadata are present.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
