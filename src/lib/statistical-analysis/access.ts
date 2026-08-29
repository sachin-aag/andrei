import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { loadAccessibleReport } from "@/lib/ai/chat/access";
import { isStatisticalAnalysisEnabled } from "@/lib/customers/packs";
import { canSaveReportSection } from "@/lib/reports/access";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import type { ReportWithManagers } from "@/lib/reports/require-report-access";

export function statisticalAnalysisDisabledResponse(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export function requireStatisticalAnalysisEnabled(): NextResponse | null {
  if (!isStatisticalAnalysisEnabled()) {
    return statisticalAnalysisDisabledResponse();
  }
  return null;
}

export type AnalyticsAccessOk = {
  ok: true;
  user: WorkspaceUser;
  report: ReportWithManagers;
  canEdit: boolean;
};

export type AnalyticsAccessDenied = {
  ok: false;
  response: NextResponse;
};

/**
 * Pack gate + report view access. `mutate` additionally requires
 * `canSaveReportSection` (same lock as section autosave).
 */
export async function requireAnalyticsAccess(
  reportId: string,
  mode: "view" | "mutate"
): Promise<AnalyticsAccessOk | AnalyticsAccessDenied> {
  const disabled = requireStatisticalAnalysisEnabled();
  if (disabled) return { ok: false, response: disabled };

  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const access = await loadAccessibleReport(reportId, user);
  if (!access) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }

  const canEdit = canSaveReportSection(user, access.report);
  if (mode === "mutate" && !canEdit) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, user, report: access.report, canEdit };
}
