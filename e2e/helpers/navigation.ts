import type { Page } from "@playwright/test";

const NAVIGATION_RACE_ERROR =
  /NS_BINDING_ABORTED|interrupted by another navigation|net::ERR_ABORTED/i;

function isNavigationRaceError(error: unknown): boolean {
  return error instanceof Error && NAVIGATION_RACE_ERROR.test(error.message);
}

export async function gotoWithNavigationRetry(
  page: Page,
  url: string,
  options?: Parameters<Page["goto"]>[1],
  maxAttempts = 3
): Promise<Awaited<ReturnType<Page["goto"]>>> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await page.goto(url, options);
    } catch (error) {
      if (!isNavigationRaceError(error) || attempt === maxAttempts) {
        throw error;
      }

      await page.waitForTimeout(250 * attempt);
    }
  }

  throw new Error("unreachable");
}

export async function parkPageForSessionSwap(page: Page): Promise<void> {
  await gotoWithNavigationRetry(
    page,
    "about:blank",
    { timeout: 5_000, waitUntil: "domcontentloaded" },
    2
  );
}
