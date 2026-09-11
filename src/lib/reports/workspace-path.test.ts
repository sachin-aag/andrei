import { describe, expect, it } from "vitest";
import { HIDDEN_EXPERT_REVIEWER_EMAIL } from "@/lib/reports/hidden-expert-reviewer";
import { reportWorkspacePath } from "./workspace-path";

describe("reportWorkspacePath", () => {
  it("sends the engineer to edit", () => {
    expect(
      reportWorkspacePath("rep-1", {
        id: "eng-1",
        role: "engineer",
        email: "eng@example.com",
      })
    ).toBe("/reports/rep-1/edit");
  });

  it("sends a manager to review", () => {
    expect(
      reportWorkspacePath("rep-1", {
        id: "mgr-1",
        role: "manager",
        email: "mgr@example.com",
      })
    ).toBe("/reports/rep-1/review");
  });

  it("sends the hidden expert reviewer to edit, not review", () => {
    expect(
      reportWorkspacePath("rep-1", {
        id: "expert-1",
        role: "manager",
        email: HIDDEN_EXPERT_REVIEWER_EMAIL,
      })
    ).toBe("/reports/rep-1/edit");
  });

  it("sends admin to the admin report view", () => {
    expect(
      reportWorkspacePath("rep-1", {
        id: "admin-1",
        role: "admin",
        email: "admin@example.com",
      })
    ).toBe("/admin/reports/rep-1");
  });

  it("sends QA to edit", () => {
    expect(
      reportWorkspacePath("rep-1", {
        id: "qa-1",
        role: "qa",
        email: "qa@example.com",
      })
    ).toBe("/reports/rep-1/edit");
  });
});
