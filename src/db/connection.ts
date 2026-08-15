import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";

let pgPool: pg.Pool | null = null;

/**
 * pg currently treats prefer/require/verify-ca as verify-full, but warns that
 * future majors will adopt weaker libpq semantics. Rewrite to verify-full so
 * Neon/`sslmode=require` URLs keep today's secure behavior without log noise.
 */
const LEGACY_SSL_MODES = new Set(["prefer", "require", "verify-ca"]);

export function normalizeDatabaseUrl(url: string): string {
  try {
    const usedPostgresScheme = /^postgres:\/\//i.test(url);
    const parsed = new URL(url.replace(/^postgres:\/\//i, "postgresql://"));
    const sslmode = parsed.searchParams.get("sslmode");
    if (sslmode && LEGACY_SSL_MODES.has(sslmode.toLowerCase())) {
      parsed.searchParams.set("sslmode", "verify-full");
    }
    const next = parsed.toString();
    return usedPostgresScheme
      ? next.replace(/^postgresql:\/\//i, "postgres://")
      : next;
  } catch {
    return url;
  }
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local (Neon branch URL or local Docker — see docs/database-environments.md)."
    );
  }
  return normalizeDatabaseUrl(url);
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
