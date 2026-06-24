import { collectPlaceholders } from "@/lib/placeholders/scan-sections";
import { loadReportSectionContentMap } from "@/lib/reports/compute-content-hash";

export async function findUnfilledMandatoryPlaceholders(reportId: string) {
  const sections = await loadReportSectionContentMap(reportId);
  return collectPlaceholders(sections);
}

export async function assertReportReadyForSubmit(
  reportId: string
): Promise<{ ok: true } | { ok: false; message: string; placeholders: number }> {
  const placeholders = await findUnfilledMandatoryPlaceholders(reportId);
  if (placeholders.length > 0) {
    return {
      ok: false,
      message: `Report has ${placeholders.length} unfilled mandatory placeholder(s). Complete all required fields before submitting.`,
      placeholders: placeholders.length,
    };
  }
  return { ok: true };
}
