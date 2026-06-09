import { expect, type Page } from "@playwright/test";

export type CreatedReport = {
  id: string;
  deviationNo: string;
};

export function uniqueDeviationNo(prefix = "E2E"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createReport(
  page: Page,
  opts?: {
    deviationNo?: string;
    assignedManagerId?: string | null;
  }
): Promise<CreatedReport> {
  const deviationNo = opts?.deviationNo ?? uniqueDeviationNo();
  const res = await page.request.post("/api/reports", {
    data: {
      deviationNo,
      assignedManagerId: opts?.assignedManagerId ?? null,
    },
  });
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
  const res = await page.request.patch(`/api/reports/${reportId}/sections/define`, {
    data: {
      content: {
        narrative: DEFINE_EVAL_NARRATIVE,
      },
    },
  });
  expect(res.ok(), `seed define failed (${res.status()})`).toBeTruthy();
}

export async function deleteReport(page: Page, reportId: string): Promise<void> {
  const res = await page.request.delete(`/api/reports/${reportId}`);
  expect(res.ok(), `delete report ${reportId} failed (${res.status()})`).toBeTruthy();
}
