/** Client-safe URL helper for analytics XLSX export (no server/canvas deps). */

export function analyticsExportHref(
  reportId: string,
  includePlots: boolean
): string {
  const path = `/api/reports/${reportId}/analytics/export`;
  return includePlots ? `${path}?plots=1` : path;
}
