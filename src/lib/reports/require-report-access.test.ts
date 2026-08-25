import { describe, expect, it } from "vitest";
import { HIDDEN_EXPERT_REVIEWER_EMAIL } from "./hidden-expert-reviewer";
import {
  aiSuggestionLockReason,
  canEditReport,
  canMutateAttachments,
  canSaveReportSection,
  canViewReport,
} from "./access";

const baseReport = {
  authorId: "engineer-1",
  assignedManagerId: "manager-1" as string | null,
  assignedManagerIds: ["manager-1"] as string[] | null,
  status: "draft",
  deletedAt: null as Date | null,
};

const roles = {
  author: { id: "engineer-1", role: "engineer" as const },
  otherEngineer: { id: "engineer-2", role: "engineer" as const },
  assignedManager: { id: "manager-1", role: "manager" as const },
  unassignedManager: { id: "manager-2", role: "manager" as const },
  qa: { id: "qa-1", role: "qa" as const },
  admin: { id: "admin-1", role: "admin" as const },
};

const STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "feedback",
  "approved",
] as const;

describe("canEditReport", () => {
  it("allows the engineer author on non-approved reports", () => {
    for (const status of STATUSES) {
      expect(
        canEditReport(roles.author, { ...baseReport, status }),
        status
      ).toBe(status !== "approved");
    }
  });

  it("denies non-author engineers", () => {
    expect(canEditReport(roles.otherEngineer, baseReport)).toBe(false);
  });

  it("denies managers even when assigned", () => {
    expect(canEditReport(roles.assignedManager, baseReport)).toBe(false);
  });

  it("denies QA", () => {
    expect(canEditReport(roles.qa, baseReport)).toBe(false);
  });

  it("allows admins on non-approved, non-deleted reports", () => {
    expect(canEditReport(roles.admin, baseReport)).toBe(true);
    expect(
      canEditReport(roles.admin, { ...baseReport, status: "approved" })
    ).toBe(false);
    expect(
      canEditReport(roles.admin, { ...baseReport, deletedAt: new Date() })
    ).toBe(false);
  });
});

describe("canSaveReportSection", () => {
  it.each([
    ["draft", true],
    ["feedback", true],
    ["in_review", true],
    ["submitted", false],
    ["approved", false],
  ] as const)("author save on %s → %s", (status, expected) => {
    expect(
      canSaveReportSection(roles.author, { ...baseReport, status })
    ).toBe(expected);
  });

  it("denies non-author engineers", () => {
    expect(canSaveReportSection(roles.otherEngineer, baseReport)).toBe(false);
  });

  it.each([
    ["submitted", true],
    ["in_review", true],
    ["draft", false],
    ["feedback", false],
    ["approved", false],
  ] as const)("manager save on %s → %s", (status, expected) => {
    expect(
      canSaveReportSection(roles.assignedManager, { ...baseReport, status })
    ).toBe(expected);
  });

  it("denies admin and QA (section saves are engineer/manager only)", () => {
    expect(canSaveReportSection(roles.admin, baseReport)).toBe(false);
    expect(canSaveReportSection(roles.qa, baseReport)).toBe(false);
  });

  it("denies tombstoned reports", () => {
    expect(
      canSaveReportSection(roles.author, {
        ...baseReport,
        deletedAt: new Date(),
      })
    ).toBe(false);
  });
});

describe("aiSuggestionLockReason", () => {
  it("returns null when the author can still save", () => {
    expect(aiSuggestionLockReason(roles.author, baseReport)).toBeNull();
  });

  it("explains submitted lock for the author", () => {
    expect(
      aiSuggestionLockReason(roles.author, {
        ...baseReport,
        status: "submitted",
      })
    ).toMatch(/already submitted/i);
  });

  it("explains approved lock", () => {
    expect(
      aiSuggestionLockReason(roles.author, {
        ...baseReport,
        status: "approved",
      })
    ).toMatch(/approved/i);
  });
});

describe("canMutateAttachments", () => {
  it.each([
    ["draft", true],
    ["feedback", true],
    ["submitted", false],
    ["in_review", false],
    ["approved", false],
  ] as const)("author mutate on %s → %s", (status, expected) => {
    expect(
      canMutateAttachments(roles.author, { ...baseReport, status })
    ).toBe(expected);
  });

  it("denies non-author engineers, managers, and QA on draft", () => {
    expect(canMutateAttachments(roles.otherEngineer, baseReport)).toBe(false);
    expect(canMutateAttachments(roles.assignedManager, baseReport)).toBe(false);
    expect(canMutateAttachments(roles.unassignedManager, baseReport)).toBe(
      false
    );
    expect(canMutateAttachments(roles.qa, baseReport)).toBe(false);
  });

  it("allows admin on draft/feedback only", () => {
    expect(canMutateAttachments(roles.admin, baseReport)).toBe(true);
    expect(
      canMutateAttachments(roles.admin, { ...baseReport, status: "feedback" })
    ).toBe(true);
    expect(
      canMutateAttachments(roles.admin, { ...baseReport, status: "submitted" })
    ).toBe(false);
  });

  it("denies mutations on tombstoned reports", () => {
    expect(
      canMutateAttachments(roles.author, {
        ...baseReport,
        deletedAt: new Date(),
      })
    ).toBe(false);
    expect(
      canMutateAttachments(roles.admin, {
        ...baseReport,
        deletedAt: new Date(),
      })
    ).toBe(false);
  });
});

describe("access matrix (view / edit / mutate attachments)", () => {
  type Expectation = {
    view: boolean;
    edit: boolean;
    mutate: boolean;
  };

  function expectAccess(
    user: (typeof roles)[keyof typeof roles],
    report: typeof baseReport,
    expected: Expectation
  ) {
    expect(canViewReport(user, report)).toBe(expected.view);
    expect(canEditReport(user, report)).toBe(expected.edit);
    expect(canMutateAttachments(user, report)).toBe(expected.mutate);
  }

  it("covers engineer author across statuses", () => {
    for (const status of STATUSES) {
      expectAccess(roles.author, { ...baseReport, status }, {
        view: true,
        edit: status !== "approved",
        mutate: status === "draft" || status === "feedback",
      });
    }
  });

  it("covers engineer non-author across statuses", () => {
    for (const status of STATUSES) {
      expectAccess(roles.otherEngineer, { ...baseReport, status }, {
        view: false,
        edit: false,
        mutate: false,
      });
    }
  });

  it("covers assigned manager across statuses", () => {
    for (const status of STATUSES) {
      expectAccess(roles.assignedManager, { ...baseReport, status }, {
        view: true,
        edit: false,
        mutate: false,
      });
    }
  });

  it("covers unassigned manager across statuses", () => {
    const unassigned = {
      ...baseReport,
      assignedManagerId: null,
      assignedManagerIds: [] as string[],
    };
    for (const status of STATUSES) {
      const mayViewQueue =
        status === "submitted" || status === "in_review";
      expectAccess(roles.unassignedManager, { ...unassigned, status }, {
        view: mayViewQueue,
        edit: false,
        mutate: false,
      });
    }
  });

  it("covers QA across statuses", () => {
    for (const status of STATUSES) {
      expectAccess(roles.qa, { ...baseReport, status }, {
        view: true,
        edit: false,
        mutate: false,
      });
    }
  });

  it("covers admin across statuses", () => {
    for (const status of STATUSES) {
      expectAccess(roles.admin, { ...baseReport, status }, {
        view: true,
        edit: status !== "approved",
        mutate: status === "draft" || status === "feedback",
      });
    }
  });

  it("covers tombstoned reports", () => {
    const tombstoned = { ...baseReport, deletedAt: new Date() };
    expectAccess(roles.author, tombstoned, {
      view: false,
      edit: false,
      mutate: false,
    });
    expectAccess(roles.assignedManager, tombstoned, {
      view: false,
      edit: false,
      mutate: false,
    });
    expectAccess(roles.qa, tombstoned, {
      view: false,
      edit: false,
      mutate: false,
    });
    expectAccess(roles.admin, tombstoned, {
      view: true,
      edit: false,
      mutate: false,
    });
  });
});

describe("hidden expert reviewer access", () => {
  const hiddenExpert = {
    id: "expert-1",
    role: "manager" as const,
    email: HIDDEN_EXPERT_REVIEWER_EMAIL,
  };
  const unassignedDraft = {
    ...baseReport,
    assignedManagerId: null,
    assignedManagerIds: [] as string[],
  };

  it("can view, edit, and save any live non-approved report", () => {
    for (const status of STATUSES) {
      const report = { ...unassignedDraft, status };
      expect(canViewReport(hiddenExpert, report)).toBe(true);
      expect(canEditReport(hiddenExpert, report)).toBe(status !== "approved");
      expect(canSaveReportSection(hiddenExpert, report)).toBe(
        status !== "approved"
      );
    }
  });

  it("can mutate attachments only on draft/feedback", () => {
    expect(canMutateAttachments(hiddenExpert, unassignedDraft)).toBe(true);
    expect(
      canMutateAttachments(hiddenExpert, {
        ...unassignedDraft,
        status: "feedback",
      })
    ).toBe(true);
    expect(
      canMutateAttachments(hiddenExpert, {
        ...unassignedDraft,
        status: "submitted",
      })
    ).toBe(false);
  });

  it("does not unlock AI suggestions on approved reports", () => {
    expect(
      aiSuggestionLockReason(hiddenExpert, {
        ...unassignedDraft,
        status: "approved",
      })
    ).toMatch(/approved/i);
    expect(aiSuggestionLockReason(hiddenExpert, unassignedDraft)).toBeNull();
  });
});
