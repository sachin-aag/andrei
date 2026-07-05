import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {},
}));

import {
  assertManagerCanActOnReport,
  assertSegregationOfDutiesForApproval,
  canManagerActOnReport,
} from "@/lib/reports/manager-authorization";

const report = {
  authorId: "e1",
  assignedManagerId: "m1",
  status: "draft",
};

describe("canManagerActOnReport", () => {
  it("allows assigned managers", () => {
    expect(canManagerActOnReport("m1", report)).toBe(true);
  });

  it("denies unassigned managers on draft reports", () => {
    expect(
      canManagerActOnReport("m2", { ...report, assignedManagerId: null })
    ).toBe(false);
  });

  it("allows any manager on submitted queue reports", () => {
    expect(
      canManagerActOnReport("m2", {
        ...report,
        assignedManagerId: null,
        status: "submitted",
      })
    ).toBe(true);
  });
});

describe("assertSegregationOfDutiesForApproval", () => {
  it("blocks reviewer from approving", () => {
    expect(assertSegregationOfDutiesForApproval("m1", "m1").ok).toBe(false);
  });

  it("allows different approver", () => {
    expect(assertSegregationOfDutiesForApproval("m2", "m1").ok).toBe(true);
  });
});

describe("assertManagerCanActOnReport", () => {
  it("returns message when not assigned", () => {
    const result = assertManagerCanActOnReport("m2", report);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("not assigned");
    }
  });
});
