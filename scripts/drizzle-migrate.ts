/**
 * Applies pending Drizzle migrations.
 *
 *   pnpm db:migrate            → non-prod DB  (.env.local overrides .env)
 *   pnpm db:migrate -- --prod  → prod DB only (.env, .env.local ignored)
 */
import { config } from "dotenv";
import {
  databaseHost,
  handleDatabaseScriptAuthFailure,
  loadDatabaseUrlOrExit,
} from "@/lib/db/run-database-script";
import { runPendingMigrations } from "@/lib/db/run-pending-migrations";

const isProd = process.argv.includes("--prod");

// Vercel/Neon inject DATABASE_URL per deployment; do not load local .env files over it.
if (!process.env.DATABASE_URL) {
  if (isProd) {
    config({ path: ".env" });
  } else {
    config({ path: ".env" });
    config({ path: ".env.local", override: true });
  }
}

const url = loadDatabaseUrlOrExit();

async function main() {
  const dbUrl = url;
  const host = databaseHost(dbUrl);

  const onVercel = Boolean(process.env.VERCEL);
  if (onVercel) {
    console.error(`vercel (${process.env.VERCEL_ENV ?? "unknown"})  →  ${host}`);
  } else if (isProd) {
    console.error(`PROD  →  ${host}`);
  } else {
    console.error(`non-prod  →  ${host}`);
  }

  console.error(
    `Applying pending migrations… (confirm this host is the DB you intended)`
  );
  await runPendingMigrations(dbUrl);
  console.error("Migrations complete.");
}

main().catch(async (e) => {
  await handleDatabaseScriptAuthFailure(e, url);
  console.error(e);
  process.exit(1);
});
