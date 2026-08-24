import { describe, expect, it } from "vitest";
import {
  HIDDEN_EXPERT_REVIEWER_EMAIL,
  isHiddenExpertReviewer,
  isHiddenExpertReviewerEmail,
  managerIdsVisibleInDisplay,
  managersVisibleInPicker,
  visibleManagerNames,
  withHiddenExpertReviewer,
} from "./hidden-expert-reviewer";

describe("hidden expert reviewer helpers", () => {
  it("matches Aditya's manager email case-insensitively", () => {
    expect(isHiddenExpertReviewerEmail(HIDDEN_EXPERT_REVIEWER_EMAIL)).toBe(true);
    expect(
      isHiddenExpertReviewerEmail("Aditya+Manager@AndreiHealth.com")
    ).toBe(true);
    expect(isHiddenExpertReviewerEmail("sachin+manager@andreihealth.com")).toBe(
      false
    );
    expect(isHiddenExpertReviewer({ email: HIDDEN_EXPERT_REVIEWER_EMAIL })).toBe(
      true
    );
  });

  it("appends the hidden expert without making him primary when others exist", () => {
    expect(withHiddenExpertReviewer(["manager-1"], "expert-1")).toEqual([
      "manager-1",
      "expert-1",
    ]);
    expect(withHiddenExpertReviewer(["expert-1"], "expert-1")).toEqual([
      "expert-1",
    ]);
    expect(withHiddenExpertReviewer([], "expert-1")).toEqual(["expert-1"]);
  });

  it("hides the expert from picker lists and displayed manager names", () => {
    const users = [
      {
        id: "m1",
        role: "manager" as const,
        email: "qa@example.com",
        name: "Priya",
      },
      {
        id: "expert",
        role: "manager" as const,
        email: HIDDEN_EXPERT_REVIEWER_EMAIL,
        name: "Aditya",
      },
      {
        id: "eng",
        role: "engineer" as const,
        email: "eng@example.com",
        name: "Sam",
      },
    ];
    expect(managersVisibleInPicker(users).map((user) => user.id)).toEqual(["m1"]);

    const usersById = Object.fromEntries(
      users.map((user) => [user.id, user])
    );
    expect(
      managerIdsVisibleInDisplay(["m1", "expert"], usersById)
    ).toEqual(["m1"]);
    expect(visibleManagerNames(["m1", "expert"], usersById)).toEqual(["Priya"]);
  });
});
