/** Temporary diagnostics for preview 500s — delete this module once root cause is found. */

export type DatabaseUrlFingerprint = {
  /** Neon endpoint host, e.g. ep-divine-mountain-…. */
  host: string | null;
  /** Postgres database name from the URL path, e.g. neondb */
  database: string | null;
  /** URL username only — never includes password */
  user: string | null;
  /** True when host contains Neon’s `-pooler` segment */
  pooled: boolean;
  /** Short stable id to match two envs without comparing full URLs */
  fingerprint: string | null;
};

function parseDatabaseUrl(raw: string | undefined): URL | null {
  const url = raw?.trim();
  if (!url) return null;
  try {
    return new URL(url.replace(/^postgresql:/i, "postgres:"));
  } catch {
    return null;
  }
}

/** Safe subset of DATABASE_URL for logs/responses — no password or full connection string. */
export function databaseUrlFingerprint(): DatabaseUrlFingerprint {
  const parsed = parseDatabaseUrl(process.env.DATABASE_URL);
  if (!parsed) {
    const fallbackHost = process.env.DATABASE_URL?.trim().match(/@([^/?]+)/)?.[1] ?? null;
    return {
      host: fallbackHost,
      database: null,
      user: null,
      pooled: fallbackHost?.includes("-pooler") ?? false,
      fingerprint: fallbackHost,
    };
  }

  const host = parsed.hostname || null;
  const database = parsed.pathname.replace(/^\//, "") || null;
  const user = parsed.username || null;
  const fingerprint = [host, database, user].filter(Boolean).join("/");

  return {
    host,
    database,
    user,
    pooled: host?.includes("-pooler") ?? false,
    fingerprint,
  };
}

export function databaseUrlHostSlug(): string | null {
  return databaseUrlFingerprint().host;
}

function logDbContext(): { db: DatabaseUrlFingerprint; hasDatabaseUrl: boolean } {
  return {
    db: databaseUrlFingerprint(),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
  };
}

export function describeErrorChain(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth++) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(" | ");
}

function postgresCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth++) {
    const code = (current as { code?: string }).code;
    if (code) return code;
    current = current instanceof Error ? current.cause : undefined;
  }
  return undefined;
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return postgresCode(error) === "23505";
}

export function createReportCreateLogger(route: "POST /api/reports" | "POST /api/reports/import-preview") {
  const prefix = `[report-create ${route}]`;
  let lastStep = "init";

  return {
    step(step: string, meta?: Record<string, unknown>) {
      lastStep = step;
      console.log(prefix, step, {
        ...logDbContext(),
        vercelEnv: process.env.VERCEL_ENV ?? null,
        vercelGitBranch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
        ...meta,
      });
    },
    fail(error: unknown, meta?: Record<string, unknown>) {
      console.error(prefix, "FAILED", {
        step: lastStep,
        ...logDbContext(),
        vercelEnv: process.env.VERCEL_ENV ?? null,
        vercelGitBranch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
        pgCode: postgresCode(error),
        error: describeErrorChain(error),
        ...meta,
      });
    },
    get lastStep() {
      return lastStep;
    },
  };
}
