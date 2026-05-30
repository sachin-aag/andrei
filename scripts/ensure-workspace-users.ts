/**
 * Creates workspace_users + user_role enum if missing.
 * Use when db:push was skipped or aborted at the confirmation prompt.
 *
 *   npm run db:ensure-workspace-users
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
  await sql`
    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('engineer', 'manager');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS workspace_users (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      email text NOT NULL,
      role user_role NOT NULL DEFAULT 'engineer',
      title text NOT NULL DEFAULT 'Engineer',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS workspace_users_email_unique
    ON workspace_users (email);
  `;

  console.log("workspace_users table is ready.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
