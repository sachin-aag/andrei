import { expect, type Page } from "@playwright/test";

export const E2E_SIGNING_PASSWORD = "E2eTestPass123!";

export function signedWorkflowPayload() {
  return { password: E2E_SIGNING_PASSWORD };
}

export async function signWorkflowAction(
  page: Page,
  buttonName: RegExp
): Promise<void> {
  await page.getByRole("button", { name: buttonName }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByLabel(/^password$/i).fill(E2E_SIGNING_PASSWORD);
  await dialog.getByRole("button", { name: /^sign &/i }).click();
}
