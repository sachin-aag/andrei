/**
 * Applies pending Drizzle migrations.
 *
 *   pnpm db:migrate            → non-prod DB  (.env.local overrides .env)
 *   pnpm db:migrate -- --prod  → prod DB only (.env, .env.local ignored)
 */
import { config } from "dotenv";
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

const url = process.env.DATABASE_URL;
if (!url) {
  const onVercel = Boolean(process.env.VERCEL);
  const vercelEnv = process.env.VERCEL_ENV ?? "unknown";
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? "(unknown branch)";

  if (onVercel && vercelEnv === "preview") {
    console.error(
      "DATABASE_URL is not set for this Vercel Preview deployment.\n" +
        `Branch: ${branch}\n` +
        "andrei-v2: enable Neon preview branching on the Vercel ↔ Neon integration.\n" +
        "andrei-demo: either add the demo Neon pooled URL to Preview in Settings → Environment Variables,\n" +
        "or set ANDREI_DEMO_PRODUCTION_ONLY=true on the andrei-demo project to skip non-production builds\n" +
        "(see docs/whitelabel-vercel-deploy.md)."
    );
  } else {
    console.error(
      "DATABASE_URL is not set. On Vercel, ensure the Neon integration is connected. Locally, use .env.local or .env."
    );
  }
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

  const onVercel = Boolean(process.env.VERCEL);
  if (onVercel) {
    console.error(`vercel (${process.env.VERCEL_ENV ?? "unknown"})  →  ${host}`);
  } else if (isProd) {
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
