import { Badge } from "@/components/ui/badge";
import type { ReportStatus } from "@/db/schema";

const LABELS: Record<ReportStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In Review",
  feedback: "Feedback",
  approved: "Approved",
};

const VARIANTS: Record<
  ReportStatus,
  "default" | "secondary" | "success" | "warning" | "destructive" | "outline"
> = {
  draft: "secondary",
  submitted: "default",
  in_review: "default",
  feedback: "warning",
  approved: "success",
};

export function StatusBadge({ status }: { status: ReportStatus }) {
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}
