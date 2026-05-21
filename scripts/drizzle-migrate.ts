/**
 * Applies pending Drizzle migrations.
 *
 *   pnpm run db:migrate
 */
import { config } from "dotenv";

import { runPendingMigrations } from "@/lib/db/run-pending-migrations";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (.env.local or .env)");
  process.exit(1);
}

async function main() {
  const dbUrl = url as string;
  console.error("Applying pending migrations…");
  await runPendingMigrations(dbUrl);
  console.error("Migrations complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
