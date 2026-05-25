# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: unlock-smoke.spec.ts >> auth entry page renders
- Location: e2e/unlock-smoke.spec.ts:3:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /enter access password|sign in to your workspace/i })
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for getByRole('heading', { name: /enter access password|sign in to your workspace/i })

```

```yaml
- region "Notifications alt+T"
- dialog "Select user":
  - heading "Select user" [level=2]
  - paragraph: Choose your name to continue. Your work is saved under this identity.
  - text: User
  - combobox "User": Select your name
  - button "Continue" [disabled]
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | test("auth entry page renders", async ({ page }) => {
  4  |   await page.goto("/unlock");
  5  | 
  6  |   // Without SITE_ACCESS_PASSWORD the unlock page redirects to /login,
  7  |   // so accept either heading.
  8  |   await expect(
  9  |     page.getByRole("heading", {
  10 |       name: /enter access password|sign in to your workspace/i,
  11 |     }),
> 12 |   ).toBeVisible({ timeout: 30_000 });
     |     ^ Error: expect(locator).toBeVisible() failed
  13 | });
  14 | 
```