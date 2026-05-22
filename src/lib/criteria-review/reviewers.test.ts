import { describe, expect, it } from "vitest";
import { normalizeCriteriaReviewEmployeeId } from "@/lib/auth/employee-id";
import { humanReviewerFromMockUser } from "@/lib/auth/reviewer-from-user";
import { humanReviewerSchema } from "@/lib/criteria-review/human-judgment";

describe("normalizeCriteriaReviewEmployeeId", () => {
  it("strips legacy prefixed employee IDs", () => {
    expect(normalizeCriteriaReviewEmployeeId("E-001")).toBe("001");
    expect(normalizeCriteriaReviewEmployeeId("M-001")).toBe("001");
  });

  it("keeps numeric employee IDs unchanged", () => {
    expect(normalizeCriteriaReviewEmployeeId("627")).toBe("627");
  });
});

describe("humanReviewerFromMockUser", () => {
  it("normalizes legacy employee IDs for API payloads", () => {
    const reviewer = humanReviewerFromMockUser({
      id: "legacy-1",
      name: "Legacy Engineer",
      email: "legacy@mjbiopharm.com",
      employeeId: "E-001",
      role: "engineer",
      title: "Engineer",
    });

    expect(reviewer).toEqual({
      id: "reviewer-001",
      name: "Legacy Engineer",
      employeeId: "001",
    });
    expect(humanReviewerSchema.safeParse(reviewer).success).toBe(true);
  });
});
