import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  DonutChart,
  InsightsPageShell,
  StatTile,
} from "@/components/insights/insights-page-shell";
import {
  AVG_CLOSURE_DAYS,
  DEMO_REPORT_SUMMARIES,
  STATUS_COUNTS,
} from "@/lib/insights/mock-data";

export default function InsightsDashboardPage() {
  const statusSegments = [
    { label: "Draft", value: STATUS_COUNTS.draft, color: "var(--brand-300)" },
    { label: "Submitted", value: STATUS_COUNTS.submitted, color: "var(--brand-500)" },
    { label: "In review", value: STATUS_COUNTS.in_review, color: "var(--brand-700)" },
    { label: "Approved", value: STATUS_COUNTS.approved, color: "var(--brand-900)" },
  ];

  return (
    <InsightsPageShell
      title="Project Management Dashboard"
      description="Mock operational view of investigation throughput and collaboration."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <StatTile label="Active reports" value={String(DEMO_REPORT_SUMMARIES.length)} />
        <StatTile label="Avg. days to closure" value={String(AVG_CLOSURE_DAYS)} />
        <StatTile label="Open reviews" value={String(STATUS_COUNTS.in_review + STATUS_COUNTS.submitted)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Reports by status</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart segments={statusSegments} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Time to closure (days open)</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              items={DEMO_REPORT_SUMMARIES.map((r) => ({
                label: r.deviationNo,
                value: r.daysOpen,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Collaborators per report</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            items={DEMO_REPORT_SUMMARIES.map((r) => ({
              label: r.title,
              value: r.collaborators,
              color: "var(--brand-600)",
            }))}
          />
        </CardContent>
      </Card>
    </InsightsPageShell>
  );
}
