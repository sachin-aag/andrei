import type pg from "pg";

/**
 * `workspace_users` and `user_role` were created with drizzle-kit push, never
 * a journaled CREATE. Fresh `migrate()` dies at `0014_remove_employee_id`
 * (`relation "workspace_users" does not exist`). Demo/MJ/Convergent already
 * have the table; IF NOT EXISTS is a no-op there.
 *
 * Shape is the 0014-era table (including `employee_id`) so 0014's UPDATE and
 * DROP COLUMN can run. Later migrations add password/tour columns.
 */
export const WORKSPACE_USERS_BASELINE_SQL = `
DO $$ BEGIN
  CREATE TYPE "public"."user_role" AS ENUM ('engineer', 'manager');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "workspace_users" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "role" "user_role" NOT NULL DEFAULT 'engineer',
  "title" text NOT NULL DEFAULT 'Engineer',
  "employee_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_users_employee_id_unique"
  ON "workspace_users" ("employee_id");
`;

export async function ensureWorkspaceUsersBaseline(
  pool: pg.Pool
): Promise<void> {
  const exists = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'workspace_users'
     ) AS exists`
  );
  if (exists.rows[0]?.exists) {
    return;
  }

  console.error(
    "schema repair: creating workspace_users (missing from 0000–0013; required by 0014)"
  );
  await pool.query(WORKSPACE_USERS_BASELINE_SQL);
}
