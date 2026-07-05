import { expect, type Page } from "@playwright/test";

export const E2E_SIGNING_PASSWORD = "E2eTestPass123!";

export const TEST_ENGINEER_EMAIL =
  process.env.TEST_AUTH_EMAIL ?? "test.engineer@mjbiopharm.com";
export const TEST_MANAGER_EMAIL = "test.manager@mjbiopharm.com";

export function signedWorkflowPayload(userId: string = TEST_ENGINEER_EMAIL) {
  return { userId, password: E2E_SIGNING_PASSWORD };
}

export async function signWorkflowAction(
  page: Page,
  buttonName: RegExp,
  userId: string = TEST_ENGINEER_EMAIL
): Promise<void> {
  await page.getByRole("button", { name: buttonName }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByLabel(/user id/i).fill(userId);
  await dialog.getByLabel(/^password$/i).fill(E2E_SIGNING_PASSWORD);
  await dialog.getByRole("button", { name: /^sign &/i }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}
