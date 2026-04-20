import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Add it to your .env.local (e.g. from Neon via the Vercel Marketplace)."
  );
}

const sql = neon(connectionString);
export const db = drizzle(sql, { schema });
export { schema };
