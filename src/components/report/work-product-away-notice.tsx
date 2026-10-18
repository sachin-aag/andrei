"use client";

/**
 * Shown when a pane has Analytics in front but is not hosting the live
 * worksheet. Report copies use `ReportDocumentReplica` instead.
 */
export function WorkProductAwayNotice({
  product,
}: {
  product: "Report" | "Analytics";
}) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2 px-6 py-5"
      data-testid={
        product === "Report"
          ? "report-away-notice"
          : "analytics-away-notice"
      }
    >
      <p className="text-sm font-medium text-[var(--foreground)]">{product}</p>
      <p className="max-w-md text-sm leading-6 text-[var(--muted-foreground)]">
        {product === "Report"
          ? "The report is edited in the top-left pane. Click that Report tab to keep working."
          : "Analytics is being edited in another pane. Click that pane to keep working there."}
      </p>
    </div>
  );
}
