import { config as loadEnv } from "dotenv";
import type { Config } from "drizzle-kit";

// .env.local wins over shell / .env (avoids pushing to Neon when local URL is configured).
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

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
