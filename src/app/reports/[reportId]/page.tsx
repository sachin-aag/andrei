import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

export default async function ReportEntryPage({
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

  if (user.role === "engineer" && report.authorId === user.id) {
    redirect(`/reports/${reportId}/edit`);
  }
  if (user.role === "manager") {
    redirect(`/reports/${reportId}/review`);
  }
  redirect(`/reports/${reportId}/edit`);
}
