import { redirect } from "next/navigation";
import { isInsightsEnabled } from "@/lib/customers";

export default function InsightsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isInsightsEnabled()) {
    redirect("/");
  }
  return children;
}
