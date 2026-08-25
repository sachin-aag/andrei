import { describe, expect, it } from "vitest";
import { resolveStepIndex, stepsForRole } from "@/lib/walkthrough/steps";
import { shouldShowProductTour } from "@/lib/walkthrough/progress";

const copy = {
  productName: "Andrei",
  documentTypeLabels: ["Investigation Report", "Design Verification Report"],
};

describe("stepsForRole", () => {
  it("puts create-report and AI Check on the engineer getting-started path", () => {
    const steps = stepsForRole("engineer", copy);
    const ids = steps.map((step) => step.id);
    expect(ids[0]).toBe("welcome");
    expect(ids.at(-1)).toBe("done");
    expect(ids).toContain("create-report");
    expect(ids).toContain("ai-check");
    expect(ids).toContain("assistant");
    expect(ids).toContain("insights");
    expect(steps.find((step) => step.id === "create-report")?.startHere).toBe(
      true
    );
  });

  it("does not offer create-report to managers", () => {
    const ids = stepsForRole("manager", copy).map((step) => step.id);
    expect(ids).not.toContain("create-report");
    expect(ids).toContain("review-actions");
    expect(ids).toContain("reports");
  });

  it("keeps QA read-only and skips approve/submit", () => {
    const ids = stepsForRole("qa", copy).map((step) => step.id);
    expect(ids).toContain("audit");
    expect(ids).not.toContain("submit");
    expect(ids).not.toContain("review-actions");
    expect(ids).not.toContain("create-report");
  });

  it("limits admins to reports, users, and profile", () => {
    const ids = stepsForRole("admin", copy).map((step) => step.id);
    expect(ids).toEqual(["welcome", "reports", "users", "profile", "done"]);
  });
});

describe("resolveStepIndex", () => {
  const steps = stepsForRole("engineer", copy);

  it("starts at welcome when no step is saved", () => {
    expect(resolveStepIndex(steps, null)).toBe(0);
  });

  it("resumes at the saved step id", () => {
    const createIndex = steps.findIndex((step) => step.id === "create-report");
    expect(resolveStepIndex(steps, "create-report")).toBe(createIndex);
  });

  it("falls back to welcome for an unknown saved id", () => {
    expect(resolveStepIndex(steps, "legacy-step")).toBe(0);
  });
});

describe("shouldShowProductTour", () => {
  it("shows for new and in-progress users only", () => {
    expect(shouldShowProductTour("not_started")).toBe(true);
    expect(shouldShowProductTour("in_progress")).toBe(true);
    expect(shouldShowProductTour("completed")).toBe(false);
    expect(shouldShowProductTour("dismissed")).toBe(false);
  });
});
