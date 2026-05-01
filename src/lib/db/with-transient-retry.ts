function describeErrorChain(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let d = 0; d < 8 && cur; d++) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = cur.cause;
    } else break;
  }
  return parts.join(" | ");
}

function looksTransientDbFailure(e: unknown): boolean {
  const text = describeErrorChain(e).toLowerCase();
  return (
    text.includes("fetch failed") ||
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("econnreset") ||
    text.includes("econnrefused") ||
    text.includes("socket hang up") ||
    text.includes("connection terminated") ||
    text.includes("connection closed") ||
    text.includes("service unavailable") ||
    text.includes(" 503 ") ||
    text.includes("dns") ||
    text.includes("getaddrinfo") ||
    text.includes("networkerror") ||
    text.includes("und_err_connect_timeout")
  );
}

/**
 * Neon serverless HTTP can fail once on cold start or brief network blips.
 * Retries only when the error chain looks transient (not wrong SQL / missing relation).
 */
export async function withTransientRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts?: { attempts?: number; baseDelayMs?: number }
): Promise<T> {
  const attempts = opts?.attempts ?? 2;
  const baseDelayMs = opts?.baseDelayMs ?? 400;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i === attempts - 1) break;
      if (!looksTransientDbFailure(e)) throw e;
      if (process.env.NODE_ENV === "development") {
        console.warn(`[db] transient failure (${label}), retrying…`, describeErrorChain(e));
      }
      await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }
  throw last;
}
