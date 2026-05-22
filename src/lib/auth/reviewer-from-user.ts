import type { MockUser } from "@/lib/auth/mock-users";
import type { HumanReviewer } from "@/lib/criteria-review/human-judgment";
import { slugifyCriteriaReviewIdPart } from "@/lib/criteria-review/report-data";

export function humanReviewerFromMockUser(user: MockUser): HumanReviewer {
  return {
    id: `reviewer-${slugifyCriteriaReviewIdPart(user.employeeId)}`,
    name: user.name,
    employeeId: user.employeeId,
  };
}
