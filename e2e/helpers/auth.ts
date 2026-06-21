import { expect, type Page } from "@playwright/test";
import { expandPrimaryNav, primaryNav } from "./workspace";
import type { UserRole } from "@/lib/auth/roles";

const TEST_AUTH_EMAIL =
  process.env.TEST_AUTH_EMAIL ?? "test.engineer@mjbiopharm.com";
const PLAYWRIGHT_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export type TestLoginResult = {
  userId: string;
  email: string;
  role: UserRole;
  sessionToken?: string;
};

const SESSION_COOKIE_NAME = "authjs.session-token";

async function ensureSessionCookie(
  page: Page,
  sessionToken: string | undefined
): Promise<void> {
  if (!sessionToken) return;

  const cookies = await page.context().cookies();
  const hasSession = cookies.some(
    (cookie) => cookie.name === SESSION_COOKIE_NAME && cookie.value === sessionToken
  );
  if (hasSession) return;

  await page.context().addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      url: PLAYWRIGHT_BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
}

async function testLogin(
  page: Page,
  body?: {
    email?: string;
    role?: UserRole;
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
        const result = (await res.json()) as TestLoginResult;
        // Keep Set-Cookie from the response; only add manually if the jar is missing it.
        await ensureSessionCookie(page, result.sessionToken);
        return result;
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

type HomeRole = "engineer" | "manager";

const HOME_HEADING: Record<HomeRole, RegExp> = {
  engineer: /my reports/i,
  manager: /reports queue/i,
};

async function waitForHomeDashboard(page: Page, role: HomeRole): Promise<void> {
  const heading = page.getByRole("heading", { name: HOME_HEADING[role] });
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await page.goto("/", { waitUntil: "load" });
    const url = page.url();
    if (url.includes("/login")) {
      if (attempt < maxAttempts) {
        await page.waitForTimeout(300 * attempt);
        continue;
      }
      expect(
        false,
        `expected ${role} home dashboard but landed on login (${url})`
      ).toBeTruthy();
    }
    try {
      await expect(heading).toBeVisible({ timeout: 15_000 });
      return;
    } catch {
      if (attempt === maxAttempts) {
        await expect(heading).toBeVisible({ timeout: 30_000 });
        return;
      }
      await page.waitForTimeout(300 * attempt);
    }
  }
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

export async function seedAuthUsers(
  page: Page,
  body?: { scope?: string }
): Promise<void> {
  const res = await page.request.post("/api/test/seed-auth-users", {
    data: body ?? {},
  });
  expect(res.ok(), `seed auth users failed (${res.status()})`).toBeTruthy();
}

export async function fetchTestManagerUser(page: Page): Promise<TestLoginResult> {
  return testLogin(page, {
    email: "test.manager@mjbiopharm.com",
    role: "manager",
  });
}

/** Mint a test session without navigating — use before direct page.goto to a deep link. */
export async function authenticateAsEngineer(page: Page): Promise<TestLoginResult> {
  const result = await testLogin(page, {
    email: "test.engineer@mjbiopharm.com",
    role: "engineer",
  });
  expect(result.role).toBe("engineer");
  return result;
}

/** Mint a test session without navigating — use before direct page.goto to a deep link. */
export async function authenticateAsManager(page: Page): Promise<TestLoginResult> {
  const result = await fetchTestManagerUser(page);
  expect(result.role).toBe("manager");
  return result;
}

export async function loginAsEngineerWithResponse(page: Page): Promise<TestLoginResult> {
  const result = await authenticateAsEngineer(page);
  await waitForHomeDashboard(page, "engineer");
  return result;
}

export async function loginAsEngineer(page: Page): Promise<void> {
  await loginAsEngineerWithResponse(page);
}

export async function loginAsManagerWithResponse(page: Page): Promise<TestLoginResult> {
  const result = await authenticateAsManager(page);
  await waitForHomeDashboard(page, "manager");
  return result;
}

export async function loginAsManager(page: Page): Promise<void> {
  await loginAsManagerWithResponse(page);
}

export async function loginAsAdminWithResponse(page: Page): Promise<TestLoginResult> {
  const result = await testLogin(page, {
    email: "test.admin@mjbiopharm.com",
    role: "admin",
  });
  expect(result.role).toBe("admin");
  await page.goto("/admin/reports", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /^reports$/i })).toBeVisible({
    timeout: 30_000,
  });
  return result;
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await loginAsAdminWithResponse(page);
}

/** UI logout via profile page (next-auth signOut + redirect to /login). */
export async function logoutFromApp(page: Page): Promise<void> {
  await expandPrimaryNav(page);
  await primaryNav(page).getByRole("link", { name: /profile/i }).click();
  await expect(page.getByRole("heading", { name: /^profile$/i })).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/login/, { timeout: 15_000 }),
    page.getByRole("button", { name: /log out/i }).click(),
  ]);
  await expect(
    page.getByRole("heading", { name: /sign in to your workspace/i })
  ).toBeVisible({ timeout: 15_000 });
}
