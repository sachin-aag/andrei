import { InsightsPageShell } from "@/components/insights/insights-page-shell";
import { DocInsightsCards } from "@/components/insights/doc-insights-cards";

export default function DocInsightsPage() {
  return (
    <InsightsPageShell
      title="Doc Insights"
      description="Per-document insight cards with customize toggles (non-functional demo)."
    >
      <DocInsightsCards />
    </InsightsPageShell>
  );
}
