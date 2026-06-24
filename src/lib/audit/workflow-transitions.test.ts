import { describe, expect, it } from "vitest";
import { assertValidStatusTransition } from "@/lib/audit/workflow-transitions";

describe("assertValidStatusTransition", () => {
  it("allows submit from draft and feedback", () => {
    expect(assertValidStatusTransition("draft", "submitted").ok).toBe(true);
    expect(assertValidStatusTransition("feedback", "submitted").ok).toBe(true);
  });

  it("blocks submit from submitted", () => {
    expect(assertValidStatusTransition("submitted", "submitted").ok).toBe(false);
  });

  it("allows approve from submitted and in_review", () => {
    expect(assertValidStatusTransition("submitted", "approved").ok).toBe(true);
    expect(assertValidStatusTransition("in_review", "approved").ok).toBe(true);
  });

  it("blocks approve from draft", () => {
    expect(assertValidStatusTransition("draft", "approved").ok).toBe(false);
  });
});
