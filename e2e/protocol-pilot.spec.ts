import { expect, test } from "@playwright/test";
import { loginAsEngineer } from "./helpers/auth";
import {
  createReport,
  deleteReport,
  uniqueDeviationNo,
} from "./helpers/reports";

const convergentPack =
  process.env.ANDREI_CUSTOMER === "convergent" ||
  process.env.NEXT_PUBLIC_ANDREI_CUSTOMER === "convergent";

test.describe("protocol pilot", () => {
  test.skip(
    !convergentPack,
    "Verification protocol is enabled only on the convergent pack."
  );

  let createdIds: string[] = [];

  test.afterEach(async ({ page }) => {
    for (const id of createdIds) {
      await deleteReport(page, id);
    }
    createdIds = [];
  });

  test("creates a verification protocol with the four SOP sections", async ({
    page,
  }) => {
    await loginAsEngineer(page);
    const documentNo = uniqueDeviationNo("VP");
    const created = await createReport(page, {
      documentNo,
      documentType: "verification_protocol",
    });
    createdIds.push(created.id);

    await page.goto(`/reports/${created.id}/edit`);
    await expect(page.getByRole("heading", { name: /^sources$/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^design inputs$/i })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /^findings$/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^modification register$/i })
    ).toBeVisible();
  });

  test("creates a verification test report whose RV table has no P/F column", async ({
    page,
  }) => {
    await loginAsEngineer(page);
    const documentNo = uniqueDeviationNo("VTR");
    const created = await createReport(page, {
      documentNo,
      documentType: "verification_test_report",
    });
    createdIds.push(created.id);

    await page.goto(`/reports/${created.id}/edit`);
    await expect(page.getByRole("heading", { name: /^cover page$/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^results and discussion$/i })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /^requirements verified$/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /^req id$/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /pass\s*\/\s*fail/i })).toHaveCount(0);
  });
});
