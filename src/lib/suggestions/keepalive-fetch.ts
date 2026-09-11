/**
 * Chrome cancels `keepalive` fetch when the body is larger than 64KiB.
 * Stay under that so Apply / Apply all can finish after Back.
 */
export const KEEPALIVE_BODY_LIMIT_BYTES = 60_000;

export function bodyFitsKeepalive(body: string): boolean {
  return new TextEncoder().encode(body).length <= KEEPALIVE_BODY_LIMIT_BYTES;
}

export function fetchWithKeepaliveIfSmall(
  input: RequestInfo | URL,
  init: Omit<RequestInit, "body"> & { body: string }
): Promise<Response> {
  return fetch(input, {
    ...init,
    keepalive: bodyFitsKeepalive(init.body),
  });
}
