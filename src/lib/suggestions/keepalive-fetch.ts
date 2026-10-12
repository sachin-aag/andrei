/**
 * Chrome cancels `keepalive` fetch when the body is larger than 64KiB,
 * and the outstanding keepalive budget is also ~64KiB for the page.
 * Stay under the per-request cap so Apply can finish after Back. Parallel
 * comment-status PATCHes should pass `keepalive: false` so they do not
 * compete with the section PATCH and reject as "Failed to fetch".
 */
export const KEEPALIVE_BODY_LIMIT_BYTES = 60_000;
export const PERSIST_NETWORK_RETRIES = 2;

export function bodyFitsKeepalive(body: string): boolean {
  return new TextEncoder().encode(body).length <= KEEPALIVE_BODY_LIMIT_BYTES;
}

function isRetryablePersistFailure(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return false;
  if (err instanceof Error && err.name === "AbortError") return false;
  return true;
}

export async function fetchWithKeepaliveIfSmall(
  input: RequestInfo | URL,
  init: Omit<RequestInit, "body"> & { body: string; keepalive?: boolean }
): Promise<Response> {
  const keepalive = init.keepalive ?? bodyFitsKeepalive(init.body);
  let lastError: unknown;
  for (let attempt = 0; attempt <= PERSIST_NETWORK_RETRIES; attempt++) {
    try {
      return await fetch(input, {
        ...init,
        keepalive,
      });
    } catch (err) {
      lastError = err;
      if (
        !isRetryablePersistFailure(err) ||
        attempt === PERSIST_NETWORK_RETRIES
      ) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
    }
  }
  throw lastError;
}
