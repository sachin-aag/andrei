/**
 * Applies pending Drizzle migrations.
 *
 *   pnpm db:migrate            → non-prod DB  (.env.local overrides .env)
 *   pnpm db:migrate -- --prod  → prod DB only (.env, .env.local ignored)
 */
import { config } from "dotenv";
import { runPendingMigrations } from "@/lib/db/run-pending-migrations";

const isProd = process.argv.includes("--prod");

if (isProd) {
  config({ path: ".env" });
} else {
  config({ path: ".env" });
  config({ path: ".env.local", override: true });
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (.env.local or .env)");
  process.exit(1);
}

function databaseHost(dbUrl: string): string {
  try {
    return new URL(dbUrl).host;
  } catch {
    return "(invalid URL)";
  }
}

async function main() {
  const dbUrl = url as string;
  const host = databaseHost(dbUrl);

  if (isProd) {
    console.error(`PROD  →  ${host}`);
  } else {
    console.error(`non-prod  →  ${host}`);
  }

  console.error("Applying pending migrations…");
  await runPendingMigrations(dbUrl);
  console.error("Migrations complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
