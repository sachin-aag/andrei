import type { Page } from "@playwright/test";

const PLAYWRIGHT_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export async function browserCookieHeaders(
  page: Page
): Promise<Record<string, string>> {
  const cookies = await page.context().cookies(PLAYWRIGHT_BASE_URL);
  if (cookies.length === 0) return {};

  return {
    cookie: cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; "),
  };
}
