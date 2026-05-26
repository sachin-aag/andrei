import { redirect } from "next/navigation";
import { humanReviewerFromMockUser } from "@/lib/auth/reviewer-from-user";
import { getCurrentUser } from "@/lib/auth/session";
import { CriteriaReviewShell } from "@/components/criteria-review/criteria-review-shell";

export default async function CriteriaReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const reviewer = humanReviewerFromMockUser(user);

  return (
    <CriteriaReviewShell reviewer={reviewer}>{children}</CriteriaReviewShell>
  );
}
