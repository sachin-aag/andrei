# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: formula-import.spec.ts >> legacy equation formula rendering >> imports DOCX formulas as visible inline images in the editor
- Location: e2e/formula-import.spec.ts:15:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 60000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic:
  - generic:
    - link:
      - /url: "#_R_1brb_"
      - text: Skip to main content
    - complementary:
      - generic:
        - generic:
          - generic:
            - img
        - generic:
          - button:
            - img
      - navigation:
        - link:
          - /url: /
          - img
        - link:
          - /url: /criteria-review
          - img
      - generic:
        - generic:
          - generic: TE
    - main:
      - generic:
        - generic:
          - generic:
            - heading [level=1]: My Reports
            - paragraph: Create and manage your deviation investigation reports.
          - button [expanded]:
            - img
            - text: New Report
        - generic:
          - generic:
            - generic:
              - img
            - heading [level=3]: No reports yet
            - paragraph: Create a new deviation investigation report to get started. Your draft will auto-save as you write.
            - button:
              - img
              - text: New Report
  - region "Notifications alt+T"
  - alert
  - dialog "Create investigation report" [active] [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - heading "Create investigation report" [level=2] [ref=e5]
        - paragraph [ref=e6]: "Starts a new deviation investigation report as a draft. Optionally upload an existing Word document (.docx): content under headings named Define, Measure, Analyze, Improve, and Control is placed into those sections. If those headings are missing, the whole document opens in Define."
      - generic [ref=e7]:
        - generic [ref=e8]:
          - generic [ref=e9]: Existing report (.docx, optional)
          - generic [ref=e10]:
            - button "Existing report (.docx, optional)" [ref=e11] [cursor=pointer]
            - generic [ref=e12]:
              - img [ref=e13]
              - text: Draft Investigation (DEV-QC-26-001).docx
            - button "Clear" [ref=e16] [cursor=pointer]:
              - img
              - text: Clear
        - generic [ref=e17]:
          - generic [ref=e18]: Deviation Number
          - textbox "Deviation Number" [ref=e20]:
            - /placeholder: e.g. DEV/PK/26/001
            - text: DEV/QC/26/001
        - generic [ref=e21]:
          - generic [ref=e22]: Assigned Manager (optional)
          - combobox [ref=e23] [cursor=pointer]:
            - generic: Pick a manager
            - img [ref=e24]
      - generic [ref=e26]:
        - button "Cancel" [ref=e27] [cursor=pointer]
        - button "Create" [ref=e28] [cursor=pointer]
    - button "Close" [ref=e29] [cursor=pointer]:
      - img [ref=e30]
      - generic [ref=e33]: Close
```

# Test source

```ts
  1  | import fs from "node:fs";
  2  | import path from "node:path";
  3  | import { expect, test } from "@playwright/test";
  4  | import { loginAsEngineer, unlockIfNeeded } from "./helpers/auth";
  5  | 
  6  | const fixturePath = path.join(
  7  |   process.cwd(),
  8  |   "docs",
  9  |   "Draft Investigation (DEV-QC-26-001).docx"
  10 | );
  11 | 
  12 | test.describe("legacy equation formula rendering", () => {
  13 |   test.skip(!fs.existsSync(fixturePath), "Draft Investigation fixture missing");
  14 | 
  15 |   test("imports DOCX formulas as visible inline images in the editor", async ({ page }) => {
  16 |     test.setTimeout(120_000);
  17 | 
  18 |     await page.goto("/");
  19 |     await unlockIfNeeded(page);
  20 |     await loginAsEngineer(page);
  21 | 
  22 |     await page.getByRole("button", { name: /new report/i }).first().click();
  23 |     await page.locator("#report-upload").setInputFiles(fixturePath);
  24 |     await expect(page.locator("#deviationNo")).not.toHaveValue("", { timeout: 30_000 });
  25 |     await page.getByRole("button", { name: /^create$/i }).click();
  26 | 
> 27 |     await page.waitForURL(/\/reports\/[^/]+\/edit/, { timeout: 60_000 });
     |                ^ TimeoutError: page.waitForURL: Timeout 60000ms exceeded.
  28 |     await page.getByRole("button", { name: /measure/i }).click();
  29 | 
  30 |     await expect(page.getByText(/Calculated the\s+TOC of blank water as per formula\./)).toBeVisible({
  31 |       timeout: 30_000,
  32 |     });
  33 |     await expect(page.getByText("[unsupported WMF image]")).toHaveCount(0);
  34 |     await expect(page.locator('.tiptap img[data-image-inline="true"]')).toHaveCount(2, {
  35 |       timeout: 15_000,
  36 |     });
  37 |   });
  38 | });
  39 | 
```