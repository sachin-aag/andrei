import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { CriteriaReviewShell } from "@/components/criteria-review/criteria-review-shell";

export default async function CriteriaReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <CriteriaReviewShell reviewer={{ id: user.id, name: user.name, email: user.email }}>
      {children}
    </CriteriaReviewShell>
  );
}
