import type { MockUser } from "@/lib/auth/mock-users";
import { normalizeCriteriaReviewEmployeeId } from "@/lib/auth/employee-id";
import {
  humanReviewerSchema,
  type HumanReviewer,
} from "@/lib/criteria-review/human-judgment";
import { slugifyCriteriaReviewIdPart } from "@/lib/criteria-review/report-data";

export function humanReviewerFromMockUser(user: MockUser): HumanReviewer {
  const employeeId = normalizeCriteriaReviewEmployeeId(user.employeeId);
  return humanReviewerSchema.parse({
    id: `reviewer-${slugifyCriteriaReviewIdPart(employeeId)}`,
    name: user.name,
    employeeId,
  });
}
