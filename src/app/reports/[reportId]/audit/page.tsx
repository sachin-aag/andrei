import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { AuditTrailPanel } from "@/components/audit/audit-trail-panel";

export default async function ReportAuditPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { reportId } = await params;
  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));

  if (!report) redirect("/");

  if (user.role !== "admin") redirect("/");

  return (
    <div className="min-h-full bg-[var(--background)]">
      <AuditTrailPanel reportId={reportId} />
    </div>
  );
}
