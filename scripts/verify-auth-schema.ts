/**
 * Verifies auth-related DB columns exist. Run against production when login/lockout fails:
 *
 *   DATABASE_URL='postgresql://...' pnpm exec tsx scripts/verify-auth-schema.ts
 *   pnpm exec tsx scripts/verify-auth-schema.ts -- --prod
 */
import { config } from "dotenv";
import pg from "pg";

const isProd = process.argv.includes("--prod");

if (!process.env.DATABASE_URL) {
  if (isProd) {
    config({ path: ".env" });
  } else {
    config({ path: ".env" });
    config({ path: ".env.local", override: true });
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const REQUIRED_WORKSPACE_USER_COLUMNS = [
  "failed_login_attempts",
  "locked_at",
  "password_changed_at",
  "password_history",
  "password_reset_token_hash",
  "password_reset_token_expires_at",
  "deactivated_at",
] as const;

const REQUIRED_PASSWORD_POLICY_COLUMNS = [
  "failed_login_attempt_limit",
  "password_history_limit",
  "inactivity_timeout_minutes",
] as const;

async function main() {
  const databaseUrl = url as string;
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const host = new URL(
      databaseUrl.replace(/^postgres:\/\//, "postgresql://")
    ).host;
    console.error(`Checking auth schema on ${host}…\n`);

    const { rows: workspaceColumns } = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'workspace_users'`
    );
    const workspaceSet = new Set(workspaceColumns.map((row) => row.column_name));

    let missing = 0;
    for (const column of REQUIRED_WORKSPACE_USER_COLUMNS) {
      if (!workspaceSet.has(column)) {
        console.error(`MISSING workspace_users.${column}`);
        missing += 1;
      }
    }

    const { rows: policyTable } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'password_policy_settings'
      ) AS exists`
    );
    if (!policyTable[0]?.exists) {
      console.error("MISSING table password_policy_settings");
      missing += 1;
    } else {
      const { rows: policyColumns } = await pool.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'password_policy_settings'`
      );
      const policySet = new Set(policyColumns.map((row) => row.column_name));
      for (const column of REQUIRED_PASSWORD_POLICY_COLUMNS) {
        if (!policySet.has(column)) {
          console.error(`MISSING password_policy_settings.${column}`);
          missing += 1;
        }
      }
    }

    let migrationCount = "unknown";
    try {
      const { rows: migrations } = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`
      );
      migrationCount = migrations[0]?.count ?? "0";
    } catch {
      migrationCount = "drizzle.__drizzle_migrations table missing";
    }
    console.error(`Applied migrations: ${migrationCount}`);

    if (missing > 0) {
      console.error(
        `\n${missing} auth schema issue(s) found. Run: pnpm db:migrate${isProd ? " -- --prod" : ""}`
      );
      process.exit(1);
    }

    console.error("Auth schema looks complete.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
