import { describe, expect, it } from "vitest";
import { normalizeCriteriaReviewEmployeeId } from "@/lib/auth/employee-id";

describe("normalizeCriteriaReviewEmployeeId", () => {
  it("strips legacy prefixed employee IDs", () => {
    expect(normalizeCriteriaReviewEmployeeId("E-001")).toBe("001");
    expect(normalizeCriteriaReviewEmployeeId("M-001")).toBe("001");
  });

  it("keeps numeric employee IDs unchanged", () => {
    expect(normalizeCriteriaReviewEmployeeId("627")).toBe("627");
  });
});
