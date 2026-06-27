import type { ReportStatus } from "@/db/schema";

const ALLOWED_TRANSITIONS: Record<
  "submitted" | "approved" | "feedback",
  ReadonlySet<ReportStatus>
> = {
  submitted: new Set(["draft", "feedback"]),
  approved: new Set(["submitted", "in_review"]),
  feedback: new Set(["submitted", "in_review"]),
};

export function assertValidStatusTransition(
  currentStatus: ReportStatus,
  nextStatus: keyof typeof ALLOWED_TRANSITIONS
): { ok: true } | { ok: false; message: string } {
  const allowed = ALLOWED_TRANSITIONS[nextStatus];
  if (!allowed.has(currentStatus)) {
    return {
      ok: false,
      message: `Cannot transition from "${currentStatus}" to "${nextStatus}".`,
    };
  }
  return { ok: true };
}
