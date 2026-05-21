import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { canAccessCriteriaReview } from "@/lib/criteria-review/access";
import { AppShell } from "@/components/layout/app-shell";
import {
  getCriteriaReviewSession,
  listCriteriaReviewSessions,
} from "@/lib/criteria-review/store";
import { listCriteriaReviewReviewers } from "@/lib/criteria-review/reviewers";
import { CriteriaReviewSessionForm } from "@/components/criteria-review/session-form";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ sessionId: string }> };

export default async function CriteriaReviewSessionPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessCriteriaReview(user)) redirect("/");
  const { sessionId } = await params;
  const id = decodeURIComponent(sessionId);
  const session = await getCriteriaReviewSession(id);
  if (!session) notFound();

  const [all, reviewers] = await Promise.all([
    listCriteriaReviewSessions(),
    listCriteriaReviewReviewers(),
  ]);
  const index = all.findIndex((s) => s.id === id);
  const prevId = index > 0 ? all[index - 1]!.id : null;
  const nextId = index >= 0 && index < all.length - 1 ? all[index + 1]!.id : null;

  return (
    <AppShell user={user}>
      <CriteriaReviewSessionForm
        session={session}
        reviewers={reviewers}
        prevId={prevId}
        nextId={nextId}
      />
    </AppShell>
  );
}
