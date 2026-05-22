import { getCurrentUser } from "@/lib/auth/session";
import { listCriteriaReviewReviewers } from "@/lib/criteria-review/reviewers";
import { CriteriaReviewShell } from "@/components/criteria-review/criteria-review-shell";

export default async function CriteriaReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [reviewers, user] = await Promise.all([
    listCriteriaReviewReviewers(),
    getCurrentUser(),
  ]);

  return (
    <CriteriaReviewShell
      initialReviewers={reviewers}
      authUserId={user?.id ?? null}
    >
      {children}
    </CriteriaReviewShell>
  );
}
