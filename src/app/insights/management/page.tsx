import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InsightsPageShell } from "@/components/insights/insights-page-shell";
import { MANAGEMENT_REPORT_ROWS } from "@/lib/insights/mock-data";

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "approved") return "default";
  if (status === "draft") return "outline";
  return "secondary";
}

export default function ManagementReportPage() {
  return (
    <InsightsPageShell
      title="Management Report"
      description="Categorized view of ten investigation reports for leadership review (demo data)."
    >
      <Card>
        <CardHeader>
          <CardTitle>Investigation portfolio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                  <th className="py-2 pr-4 font-medium">Deviation</th>
                  <th className="py-2 pr-4 font-medium">Title</th>
                  <th className="py-2 pr-4 font-medium">Procedure</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Days open</th>
                  <th className="py-2 font-medium">Collaborators</th>
                </tr>
              </thead>
              <tbody>
                {MANAGEMENT_REPORT_ROWS.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-3 pr-4 font-medium">{row.deviationNo}</td>
                    <td className="py-3 pr-4">{row.title}</td>
                    <td className="py-3 pr-4">{row.procedure}</td>
                    <td className="py-3 pr-4">
                      <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                    </td>
                    <td className="py-3 pr-4">{row.daysOpen}</td>
                    <td className="py-3">{row.collaborators}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </InsightsPageShell>
  );
}
