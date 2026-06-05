import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { AppShell } from "@/components/layout/app-shell";
import { ImproveAiSessionForm } from "@/components/improve-ai/improve-ai-session-form";
import { getImproveAiSessionView } from "@/lib/improve-ai/store";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ sessionId: string }> };

export default async function ImproveAiSessionPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { sessionId } = await params;
  const id = decodeURIComponent(sessionId);
  const session = await getImproveAiSessionView(id, user.id);
  if (!session) notFound();

  const workspaceUsers = await listWorkspaceUsers();

  if (session.status === "evaluating") {
    return (
      <AppShell user={user} initialUsers={workspaceUsers}>
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <Loader2 className="size-10 animate-spin text-[var(--brand-500)]" />
          <div>
            <h1 className="text-lg font-semibold">Running AI evaluation</h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-1 max-w-md">
              Criteria evaluation is in progress for {session.deviationNo}. Refresh
              this page in a moment to review results and give feedback.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/improve-ai">Back to Improve AI</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  if (!session.sections.length) {
    return (
      <AppShell user={user} initialUsers={workspaceUsers}>
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">
            No evaluable section content was found for this report.
          </p>
          <Button variant="outline" asChild>
            <Link href="/improve-ai">Back to Improve AI</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell user={user} initialUsers={workspaceUsers}>
      <ImproveAiSessionForm
        session={session}
        userName={user.name}
        userEmail={user.email}
      />
    </AppShell>
  );
}
