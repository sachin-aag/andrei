/**
 * Pool for maintenance scripts. Works with local Postgres and Neon `postgresql://` URLs.
 */
import { config } from "dotenv";
import pg from "pg";
import { databaseUrl } from "../src/db/connection";

config({ path: ".env.local" });
config({ path: ".env" });

export function createScriptPool() {
  return new pg.Pool({ connectionString: databaseUrl(), max: 1 });
}
