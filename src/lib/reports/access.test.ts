import { describe, expect, it } from "vitest";
import { canViewReport } from "./access";

const report = {
  authorId: "engineer-1",
  assignedManagerId: "manager-1",
  status: "draft",
};

describe("canViewReport", () => {
  it("allows admins to view any report", () => {
    expect(
      canViewReport(
        { id: "admin-1", role: "admin" },
        { ...report, authorId: "other" }
      )
    ).toBe(true);
  });

  it("allows engineers to view their own reports", () => {
    expect(
      canViewReport({ id: "engineer-1", role: "engineer" }, report)
    ).toBe(true);
  });

  it("denies engineers access to other authors' reports", () => {
    expect(
      canViewReport(
        { id: "engineer-2", role: "engineer" },
        report
      )
    ).toBe(false);
  });

  it("allows managers assigned to the report", () => {
    expect(
      canViewReport({ id: "manager-1", role: "manager" }, report)
    ).toBe(true);
  });

  it("allows any manager assigned in the report manager list", () => {
    expect(
      canViewReport(
        { id: "manager-2", role: "manager" },
        { ...report, assignedManagerIds: ["manager-1", "manager-2"] }
      )
    ).toBe(true);
  });

  it("allows managers to view submitted queue reports", () => {
    expect(
      canViewReport(
        { id: "manager-2", role: "manager" },
        { ...report, assignedManagerId: null, status: "submitted" }
      )
    ).toBe(true);
  });

  it("allows managers to view in-review queue reports", () => {
    expect(
      canViewReport(
        { id: "manager-2", role: "manager" },
        { ...report, assignedManagerId: null, status: "in_review" }
      )
    ).toBe(true);
  });

  it("denies managers access to unrelated draft reports", () => {
    expect(
      canViewReport(
        { id: "manager-2", role: "manager" },
        { ...report, assignedManagerId: null, status: "draft" }
      )
    ).toBe(false);
  });

  it("allows QA viewers to view active reports", () => {
    expect(
      canViewReport({ id: "qa-1", role: "qa" }, report)
    ).toBe(true);
  });

  it("denies QA viewers access to tombstoned reports", () => {
    expect(
      canViewReport(
        { id: "qa-1", role: "qa" },
        { ...report, deletedAt: new Date() }
      )
    ).toBe(false);
  });

  it("allows admins to view tombstoned reports", () => {
    expect(
      canViewReport(
        { id: "admin-1", role: "admin" },
        { ...report, deletedAt: new Date() }
      )
    ).toBe(true);
  });
});
