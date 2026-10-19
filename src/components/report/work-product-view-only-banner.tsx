"use client";

/**
 * Pinned chrome on a Report or Analytics copy. Rendered in CanvasTabPane
 * `header`, so it stays put while the pane body scrolls.
 */
export function WorkProductViewOnlyBanner({
  product,
}: {
  product: "Report" | "Analytics";
}) {
  return (
    <p
      className="border-b border-[var(--border)] bg-[var(--muted)] px-6 py-2 text-sm text-[var(--muted-foreground)]"
      data-testid={
        product === "Report"
          ? "report-view-only-banner"
          : "analytics-view-only-banner"
      }
    >
      {product === "Report"
        ? "View only. Edits stay in the top-left report."
        : "View only. Edits stay in the other Analytics pane."}
    </p>
  );
}
