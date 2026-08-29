import { describe, expect, it } from "vitest";
import { deriveChatEditPolicy, isWorkspaceChrome } from "@/lib/ai/chat/edit-policy";

describe("deriveChatEditPolicy", () => {
  it("commits only in agent chrome when the report is writable", () => {
    expect(
      deriveChatEditPolicy({ workspaceChrome: "agent", canEdit: true })
    ).toBe("commit");
    expect(
      deriveChatEditPolicy({ workspaceChrome: "document", canEdit: true })
    ).toBe("propose");
  });

  it("never commits on a locked report", () => {
    expect(
      deriveChatEditPolicy({ workspaceChrome: "agent", canEdit: false })
    ).toBe("propose");
  });
});

describe("isWorkspaceChrome", () => {
  it("accepts only document and agent", () => {
    expect(isWorkspaceChrome("document")).toBe(true);
    expect(isWorkspaceChrome("agent")).toBe(true);
    expect(isWorkspaceChrome("analytics")).toBe(false);
    expect(isWorkspaceChrome(undefined)).toBe(false);
  });
});
