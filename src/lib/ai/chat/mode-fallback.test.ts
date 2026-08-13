import { describe, expect, it } from "vitest";
import { chatModeAfterPermissionCheck } from "./mode-fallback";

describe("chatModeAfterPermissionCheck", () => {
  it("keeps Agent while the user role is still unknown", () => {
    expect(
      chatModeAfterPermissionCheck({
        mode: "agent",
        role: undefined,
        canProposeAiEdits: false,
      })
    ).toBe("agent");
  });

  it("falls back to Plan once a known user cannot propose edits", () => {
    expect(
      chatModeAfterPermissionCheck({
        mode: "agent",
        role: "qa",
        canProposeAiEdits: false,
      })
    ).toBe("plan");
  });

  it("keeps Agent when the known user can propose edits", () => {
    expect(
      chatModeAfterPermissionCheck({
        mode: "agent",
        role: "engineer",
        canProposeAiEdits: true,
      })
    ).toBe("agent");
  });

  it("does not override an explicit Plan selection", () => {
    expect(
      chatModeAfterPermissionCheck({
        mode: "plan",
        role: "engineer",
        canProposeAiEdits: true,
      })
    ).toBe("plan");
  });
});
