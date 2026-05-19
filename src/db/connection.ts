import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";

let pgPool: pg.Pool | null = null;

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local (Neon branch URL or local Docker — see docs/database-environments.md)."
    );
  }
  return url;
}

/** True when DATABASE_URL points at localhost (Docker / local Postgres). */
export function isLocalDatabaseUrl(url: string): boolean {
  try {
    const normalized = url.replace(/^postgres:\/\//, "postgresql://");
    const { hostname } = new URL(normalized);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function createDrizzleDb<TSchema extends Record<string, unknown>>(
  schema: TSchema
) {
  const url = databaseUrl();
  if (isLocalDatabaseUrl(url)) {
    pgPool = new pg.Pool({ connectionString: url });
    return drizzlePg(pgPool, { schema });
  }
  return drizzleNeon(neon(url), { schema });
}

export async function closeDbConnections(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
}
