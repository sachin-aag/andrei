import type { Page } from "@playwright/test";

const PLAYWRIGHT_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

const SESSION_COOKIE_NAME = "authjs.session-token";

export function authSessionCookieHeader(
  sessionToken: string
): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` };
}

export async function browserCookieHeaders(
  page: Page
): Promise<Record<string, string>> {
  const cookies = await page.context().cookies(PLAYWRIGHT_BASE_URL);
  const sessionCookies = cookies.filter(
    (cookie) => cookie.name === SESSION_COOKIE_NAME
  );
  const session = sessionCookies.at(-1);
  if (!session) return {};

  return { cookie: `${session.name}=${session.value}` };
}
