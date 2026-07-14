import { describe, expect, it } from "vitest";
import { deriveSessionTitle, UNTITLED_SESSION } from "./session-title";

describe("deriveSessionTitle", () => {
  it("uses the first line of the message", () => {
    expect(deriveSessionTitle("Draft the Define section\nmore detail")).toBe(
      "Draft the Define section"
    );
  });

  it("collapses whitespace", () => {
    expect(deriveSessionTitle("  Tighten   the   problem  ")).toBe(
      "Tighten the problem"
    );
  });

  it("truncates long titles with an ellipsis", () => {
    const long = "a".repeat(90);
    const title = deriveSessionTitle(long);
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(60);
  });

  it("falls back to the untitled label when empty", () => {
    expect(deriveSessionTitle("   ")).toBe(UNTITLED_SESSION);
    expect(deriveSessionTitle("")).toBe(UNTITLED_SESSION);
  });
});
