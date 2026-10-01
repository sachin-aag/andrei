import { describe, expect, it } from "vitest";
import { isWorkspaceChrome } from "@/lib/ai/chat/edit-policy";

describe("isWorkspaceChrome", () => {
  it("accepts only document and agent", () => {
    expect(isWorkspaceChrome("document")).toBe(true);
    expect(isWorkspaceChrome("agent")).toBe(true);
    expect(isWorkspaceChrome("analytics")).toBe(false);
    expect(isWorkspaceChrome(undefined)).toBe(false);
  });
});
