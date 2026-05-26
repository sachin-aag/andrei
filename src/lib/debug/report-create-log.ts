/** Temporary diagnostics for preview 500s — delete this module once root cause is found. */

export function databaseUrlHostSlug(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  try {
    return new URL(url.replace(/^postgresql:/i, "postgres:")).hostname;
  } catch {
    return url.match(/@([^/?]+)/)?.[1] ?? "unparseable";
  }
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
  const err = error as { code?: string; cause?: { code?: string } };
  return err?.code ?? err?.cause?.code;
}

export function createReportCreateLogger(route: "POST /api/reports" | "POST /api/reports/import-preview") {
  const prefix = `[report-create ${route}]`;
  let lastStep = "init";

  return {
    step(step: string, meta?: Record<string, unknown>) {
      lastStep = step;
      console.log(prefix, step, {
        dbHost: databaseUrlHostSlug(),
        hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
        vercelEnv: process.env.VERCEL_ENV ?? null,
        ...meta,
      });
    },
    fail(error: unknown, meta?: Record<string, unknown>) {
      console.error(prefix, "FAILED", {
        step: lastStep,
        dbHost: databaseUrlHostSlug(),
        hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
        vercelEnv: process.env.VERCEL_ENV ?? null,
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
