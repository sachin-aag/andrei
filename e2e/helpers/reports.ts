import { expect, type Page } from "@playwright/test";
import { browserCookieHeaders } from "./api";

export type CreatedReport = {
  id: string;
  deviationNo: string;
};

export function uniqueDeviationNo(prefix = "E2E"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Header "New Report" on the engineer dashboard. */
export function newReportButton(page: Page) {
  return page.getByRole("button", { name: /new report/i });
}

export async function openNewReportDialog(page: Page): Promise<void> {
  await newReportButton(page).click();
  await expect(
    page.getByRole("heading", { name: /create investigation report/i })
  ).toBeVisible();
}

export async function createReport(
  page: Page,
  opts?: {
    deviationNo?: string;
    assignedManagerId?: string | null;
    assignedManagerIds?: string[];
  }
): Promise<CreatedReport> {
  const deviationNo = opts?.deviationNo ?? uniqueDeviationNo();
  const payload = {
    deviationNo,
    assignedManagerId: opts?.assignedManagerId ?? null,
    ...(opts?.assignedManagerIds
      ? { assignedManagerIds: opts.assignedManagerIds }
      : {}),
  };

  let res = await page.request.post("/api/reports", {
    data: payload,
    headers: await browserCookieHeaders(page),
  });
  if (!res.ok()) {
    await page.waitForTimeout(500);
    res = await page.request.post("/api/reports", {
      data: payload,
      headers: await browserCookieHeaders(page),
    });
  }
  expect(res.ok(), `create report failed (${res.status()})`).toBeTruthy();
  const body = (await res.json()) as {
    id: string;
    report: { id: string; deviationNo: string };
  };
  return { id: body.id, deviationNo: body.report.deviationNo };
}

const DEFINE_EVAL_NARRATIVE = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "On 01/01/2026 at 10:00 hrs, a deviation was observed during testing. The result exceeded acceptance limits.",
        },
      ],
    },
  ],
};

/** Ensures Define has enough sentences for AI evaluation endpoints. */
export async function seedDefineForEvaluation(
  page: Page,
  reportId: string
): Promise<void> {
  const res = await page.request.patch(
    `/api/reports/${reportId}/sections/define`,
    {
      data: {
        content: {
          narrative: DEFINE_EVAL_NARRATIVE,
        },
      },
      headers: await browserCookieHeaders(page),
    }
  );
  expect(res.ok(), `seed define failed (${res.status()})`).toBeTruthy();
}

export async function deleteReport(page: Page, reportId: string): Promise<void> {
  const res = await page.request.delete(`/api/reports/${reportId}`, {
    headers: await browserCookieHeaders(page),
  });
  if (res.status() === 409) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (body?.error === "Approved reports cannot be deleted") {
      return;
    }
  }
  expect(res.ok(), `delete report ${reportId} failed (${res.status()})`).toBeTruthy();
}
