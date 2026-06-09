import { expect, type Page } from "@playwright/test";

const TEST_AUTH_EMAIL =
  process.env.TEST_AUTH_EMAIL ?? "test.engineer@mjbiopharm.com";

export type TestLoginResult = {
  userId: string;
  email: string;
  role: "engineer" | "manager";
};

async function testLogin(
  page: Page,
  body?: {
    email?: string;
    role?: "engineer" | "manager";
    mustChangePassword?: boolean;
  }
): Promise<TestLoginResult> {
  const res = await page.request.post("/api/test/login", { data: body ?? {} });
  expect(
    res.ok(),
    `test login failed (${res.status()}): is ALLOW_TEST_LOGIN enabled and TEST_AUTH_EMAIL="${TEST_AUTH_EMAIL}" set?`
  ).toBeTruthy();
  return (await res.json()) as TestLoginResult;
}

export async function seedAuthUsers(page: Page): Promise<void> {
  const res = await page.request.post("/api/test/seed-auth-users");
  expect(res.ok(), `seed auth users failed (${res.status()})`).toBeTruthy();
}

export async function fetchTestManagerUser(page: Page): Promise<TestLoginResult> {
  return testLogin(page, {
    email: "test.manager@mjbiopharm.com",
    role: "manager",
  });
}

export async function loginAsEngineerWithResponse(page: Page): Promise<TestLoginResult> {
  const result = await testLogin(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /my reports/i })
  ).toBeVisible({ timeout: 30_000 });
  return result;
}

export async function loginAsEngineer(page: Page): Promise<void> {
  await loginAsEngineerWithResponse(page);
}

export async function loginAsManagerWithResponse(page: Page): Promise<TestLoginResult> {
  const result = await fetchTestManagerUser(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /reports queue/i })
  ).toBeVisible({ timeout: 30_000 });
  return result;
}

export async function loginAsManager(page: Page): Promise<void> {
  await loginAsManagerWithResponse(page);
}
