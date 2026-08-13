import { config as loadEnv } from "dotenv";
import type { Config } from "drizzle-kit";

// CI / explicit shell DATABASE_URL must win (ephemeral Postgres in GitHub Actions).
// Locally, .env.local overrides shell so `db:push` does not hit Neon after `vercel env pull`.
if (!process.env.CI) {
  loadEnv({ path: ".env" });
  loadEnv({ path: ".env.local", override: true });
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add it to .env.local (e.g. the Neon connection string from the Vercel Marketplace)."
  );
}

export default {
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
} satisfies Config;
