import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, InsightsPageShell } from "@/components/insights/insights-page-shell";
import { PITFALLS_BY_PROCEDURE } from "@/lib/insights/mock-data";

export default function InsightsPitfallsPage() {
  return (
    <InsightsPageShell
      title="Common Pitfalls by Procedure"
      description="Recurring documentation gaps grouped by procedure area (demo data)."
    >
      <div className="grid gap-6">
        {PITFALLS_BY_PROCEDURE.map((group) => (
          <Card key={group.procedure}>
            <CardHeader>
              <CardTitle>{group.procedure}</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                items={group.gaps.map((gap) => ({
                  label: gap.label,
                  value: gap.count,
                }))}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </InsightsPageShell>
  );
}
