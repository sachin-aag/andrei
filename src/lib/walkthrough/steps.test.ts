import { describe, expect, it } from "vitest";
import {
  productTourStepIsOnPage,
  resolveStepIndex,
  resumeTourIndexForPathname,
  stepsForRole,
} from "@/lib/walkthrough/steps";
import { shouldShowProductTour } from "@/lib/walkthrough/progress";

const copy = {
  productName: "Andrei",
  documentTypeLabels: ["Investigation Report", "Design Verification Report"],
  insightsEnabled: true,
  statisticalAnalysisEnabled: true,
};

const mjCopy = {
  ...copy,
  insightsEnabled: false,
};

describe("stepsForRole", () => {
  it("always welcomes users to Andrei regardless of customer pack", () => {
    const welcome = stepsForRole("engineer", {
      ...copy,
      productName: "Convergent",
    }).find((step) => step.id === "welcome");
    expect(welcome?.title).toBe("Welcome to Andrei");
  });

  it("puts create-report and AI Check on the engineer getting-started path", () => {
    const steps = stepsForRole("engineer", copy);
    const ids = steps.map((step) => step.id);
    expect(ids[0]).toBe("welcome");
    expect(ids.at(-1)).toBe("done");
    expect(ids).toContain("create-report");
    expect(ids).toContain("ai-check");
    expect(ids).toContain("chrome");
    expect(ids).toContain("assistant");
    expect(ids).toContain("analytics");
    expect(ids).toContain("vault");
    expect(ids).toContain("insights");
    expect(ids).not.toContain("improve-ai");
    expect(steps.find((step) => step.id === "create-report")?.startHere).toBe(
      true
    );
    expect(steps.find((step) => step.id === "chrome")?.startHere).toBe(true);
  });

  it("keeps every report-workspace card together before leaving for vault", () => {
    const ids = stepsForRole("engineer", copy).map((step) => step.id);
    const chrome = ids.indexOf("chrome");
    const vault = ids.indexOf("vault");
    const inReport = ids.slice(chrome, vault);
    expect(inReport).toEqual([
      "chrome",
      "editor",
      "ai-check",
      "assistant",
      "analytics",
      "attachments",
      "submit",
      "export",
    ]);
  });

  it("omits Insights on packs that hide the nav", () => {
    const ids = stepsForRole("engineer", mjCopy).map((step) => step.id);
    expect(ids).toContain("vault");
    expect(ids).toContain("analytics");
    expect(ids).not.toContain("insights");
  });

  it("does not offer create-report to managers", () => {
    const ids = stepsForRole("manager", copy).map((step) => step.id);
    expect(ids).not.toContain("create-report");
    expect(ids).toContain("review-actions");
    expect(ids).toContain("reports");
    expect(ids).toContain("vault");
    expect(ids).toContain("analytics");
    expect(ids).not.toContain("improve-ai");
  });

  it("keeps QA read-only and skips approve/submit", () => {
    const ids = stepsForRole("qa", copy).map((step) => step.id);
    expect(ids).toContain("audit");
    expect(ids).toContain("vault");
    expect(ids).not.toContain("submit");
    expect(ids).not.toContain("review-actions");
    expect(ids).not.toContain("create-report");
    expect(ids).not.toContain("improve-ai");
  });

  it("limits admins to reports, vault, users, and profile", () => {
    const ids = stepsForRole("admin", copy).map((step) => step.id);
    expect(ids).toEqual([
      "welcome",
      "reports",
      "vault",
      "users",
      "profile",
      "done",
    ]);
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

describe("productTourStepIsOnPage", () => {
  const steps = stepsForRole("engineer", copy);
  const chrome = steps.find((step) => step.id === "chrome")!;
  const welcome = steps.find((step) => step.id === "welcome")!;

  it("hides report-only cards on the dashboard", () => {
    expect(productTourStepIsOnPage(chrome, "/")).toBe(false);
    expect(productTourStepIsOnPage(welcome, "/")).toBe(true);
  });

  it("shows report-only cards once a report is open", () => {
    expect(productTourStepIsOnPage(chrome, "/reports/abc/edit")).toBe(true);
  });
});

describe("resumeTourIndexForPathname", () => {
  const steps = stepsForRole("engineer", copy);
  const createIndex = steps.findIndex((step) => step.id === "create-report");
  const chromeIndex = steps.findIndex((step) => step.id === "chrome");
  const vaultIndex = steps.findIndex((step) => step.id === "vault");

  it("stays on Document or Agent until a report is open", () => {
    expect(resumeTourIndexForPathname(steps, chromeIndex, "/")).toBe(chromeIndex);
  });

  it("resumes at Document or Agent when a report opens from create-report", () => {
    expect(
      resumeTourIndexForPathname(steps, createIndex, "/reports/abc/edit")
    ).toBe(chromeIndex);
  });

  it("does not skip vault while the report is still on screen", () => {
    expect(
      resumeTourIndexForPathname(steps, vaultIndex, "/reports/abc/edit")
    ).toBe(vaultIndex);
  });

  it("resumes manager review when a report opens from the queue", () => {
    const managerSteps = stepsForRole("manager", copy);
    const reportsIndex = managerSteps.findIndex((step) => step.id === "reports");
    const reviewIndex = managerSteps.findIndex((step) => step.id === "review");
    expect(
      resumeTourIndexForPathname(managerSteps, reportsIndex, "/reports/abc/review")
    ).toBe(reviewIndex);
  });
});
