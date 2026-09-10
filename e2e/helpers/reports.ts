import { expect, type Page } from "@playwright/test";
import {
  authenticateAsEngineer,
  loginAsTestUser,
  type TestLoginResult,
} from "./auth";
import { authSessionCookieHeader, browserCookieHeaders } from "./api";

export type CreatedReport = {
  id: string;
  deviationNo: string;
  documentNo: string;
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
    documentNo?: string;
    assignedManagerId?: string | null;
    assignedManagerIds?: string[];
  }
): Promise<CreatedReport> {
  const documentNo =
    opts?.documentNo ?? opts?.deviationNo ?? uniqueDeviationNo();
  const payload = {
    documentNo,
    // Temporary alias still accepted by create API
    deviationNo: documentNo,
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
    report: { id: string; documentNo: string };
  };
  return {
    id: body.id,
    documentNo: body.report.documentNo,
    deviationNo: body.report.documentNo,
  };
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

function richParagraph(text: string) {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function richTableCell(
  text: string,
  kind: "tableHeader" | "tableCell"
) {
  return {
    type: kind,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [richParagraph(text)],
  };
}

/** Long prose + a 2-column label/description table (Convergent Scope layout). */
export const DEFINE_TWO_COLUMN_TABLE_NARRATIVE = {
  type: "doc",
  content: [
    richParagraph(
      "This test report applies to Solea Model 3 and is used as a verification activity for system requirements covering software, hardware, and configuration."
    ),
    richParagraph("Testing was executed on both TOP-00017 and TOP-00051 system configurations."),
    richParagraph("Table 1: Software Under Test"),
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            richTableCell("Solea Model 3.0 SW Application Version", "tableHeader"),
            richTableCell("Description", "tableHeader"),
          ],
        },
        {
          type: "tableRow",
          content: [
            richTableCell("Testing per 825-00024 Rev. F", "tableCell"),
            richTableCell(
              "Original software build for the full execution of the Solea Model 3 System",
              "tableCell"
            ),
          ],
        },
      ],
    },
  ],
};

/** Seeds Define with mixed prose + a 2-column table so wrapping can be asserted. */
export async function seedDefineWithTwoColumnTable(
  page: Page,
  reportId: string
): Promise<void> {
  const res = await page.request.patch(
    `/api/reports/${reportId}/sections/define`,
    {
      data: {
        content: {
          narrative: DEFINE_TWO_COLUMN_TABLE_NARRATIVE,
        },
      },
      headers: await browserCookieHeaders(page),
    }
  );
  expect(res.ok(), `seed define table failed (${res.status()})`).toBeTruthy();
}

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

function authHeadersFromLogin(login: TestLoginResult): Record<string, string> {
  return login.sessionToken
    ? authSessionCookieHeader(login.sessionToken)
    : {};
}

async function loginAsReportAuthor(
  page: Page,
  authorEmail?: string
): Promise<TestLoginResult> {
  if (authorEmail) {
    return loginAsTestUser(page, { email: authorEmail, role: "engineer" });
  }
  return authenticateAsEngineer(page);
}

async function isAcceptedDeleteResponse(
  res: Awaited<ReturnType<Page["request"]["delete"]>>
): Promise<boolean> {
  if (res.ok()) return true;
  if (res.status() === 409) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return body?.error === "Approved reports cannot be deleted";
  }
  return false;
}

export async function deleteReport(
  page: Page,
  reportId: string,
  opts?: { authorEmail?: string }
): Promise<void> {
  const currentHeaders = await browserCookieHeaders(page);
  if (Object.keys(currentHeaders).length > 0) {
    const currentRes = await page.request.delete(`/api/reports/${reportId}`, {
      headers: currentHeaders,
    });
    if (await isAcceptedDeleteResponse(currentRes)) {
      return;
    }
    if (currentRes.status() !== 403) {
      expect(
        currentRes.ok(),
        `delete report ${reportId} failed (${currentRes.status()})`
      ).toBeTruthy();
    }
  }

  const login = await loginAsReportAuthor(page, opts?.authorEmail);
  const headers = authHeadersFromLogin(login);
  const resolvedHeaders =
    Object.keys(headers).length > 0 ? headers : await browserCookieHeaders(page);

  const res = await page.request.delete(`/api/reports/${reportId}`, {
    headers: resolvedHeaders,
  });
  if (await isAcceptedDeleteResponse(res)) {
    return;
  }
  expect(res.ok(), `delete report ${reportId} failed (${res.status()})`).toBeTruthy();
}

/** Removes all active reports owned by a test engineer (E2E cleanup). */
export async function deleteAllReportsForAuthor(
  page: Page,
  authorEmail: string
): Promise<void> {
  const login = await loginAsReportAuthor(page, authorEmail);
  const headers = authHeadersFromLogin(login);
  const resolvedHeaders =
    Object.keys(headers).length > 0 ? headers : await browserCookieHeaders(page);
  if (Object.keys(resolvedHeaders).length === 0) return;

  const listRes = await page.request.get("/api/reports", {
    headers: resolvedHeaders,
  });
  if (!listRes.ok()) return;

  const body = (await listRes.json()) as { reports: Array<{ id: string }> };
  for (const report of body.reports) {
    await page.request.delete(`/api/reports/${report.id}`, {
      headers: resolvedHeaders,
    });
  }
}
