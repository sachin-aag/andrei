import { expect, type Page } from "@playwright/test";
import { expandPrimaryNav } from "./workspace";

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
    passwordExpired?: boolean;
    passwordWarning?: boolean;
  }
): Promise<TestLoginResult> {
  await page.context().clearCookies();

  const maxAttempts = 3;
  let lastMessage = "unknown error";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await page.request.post("/api/test/login", { data: body ?? {} });
      if (res.ok()) {
        return (await res.json()) as TestLoginResult;
      }
      lastMessage = `HTTP ${res.status()}`;
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : String(error);
    }

    if (attempt < maxAttempts) {
      await page.waitForTimeout(300 * attempt);
    }
  }

  expect(
    false,
    `test login failed after ${maxAttempts} attempts (${lastMessage}): is ALLOW_TEST_LOGIN enabled and TEST_AUTH_EMAIL="${TEST_AUTH_EMAIL}" set?`
  ).toBeTruthy();
  throw new Error("unreachable");
}

export async function loginAsTestUser(
  page: Page,
  body: {
    email?: string;
    role?: "engineer" | "manager";
    mustChangePassword?: boolean;
    passwordExpired?: boolean;
    passwordWarning?: boolean;
  }
): Promise<TestLoginResult> {
  return testLogin(page, body);
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
  await page.goto("/", { waitUntil: "domcontentloaded" });
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
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: /reports queue/i })
  ).toBeVisible({ timeout: 30_000 });
  return result;
}

export async function loginAsManager(page: Page): Promise<void> {
  await loginAsManagerWithResponse(page);
}

/** UI logout via sidebar (next-auth signOut + redirect to /login). */
export async function logoutFromApp(page: Page): Promise<void> {
  await expandPrimaryNav(page);
  await Promise.all([
    page.waitForURL(/\/login/, { timeout: 15_000 }),
    page.getByRole("button", { name: /log out/i }).click(),
  ]);
  await expect(
    page.getByRole("heading", { name: /sign in to your workspace/i })
  ).toBeVisible({ timeout: 15_000 });
}
