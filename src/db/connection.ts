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

/**
 * Always use node-postgres. The Neon HTTP driver (`drizzle-orm/neon-http`) does
 * not support `db.transaction()`, which document ingest and folder moves need.
 * App routes run on the Node.js runtime, so TCP/`pg` is available on Vercel.
 */
export function createDrizzleDb<TSchema extends Record<string, unknown>>(
  schema: TSchema
) {
  const url = databaseUrl();
  pgPool = new pg.Pool({
    connectionString: url,
    // Serverless: keep the pool tiny so warm instances don't exhaust Neon.
    max: isLocalDatabaseUrl(url) ? 10 : 1,
  });
  return drizzlePg(pgPool, { schema });
}

export async function closeDbConnections(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
}
