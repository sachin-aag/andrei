import { describe, expect, it } from "vitest";
import { shouldShowProductTour } from "@/lib/walkthrough/progress";

describe("shouldShowProductTour", () => {
  it("shows not_started and in_progress only", () => {
    expect(shouldShowProductTour("not_started")).toBe(true);
    expect(shouldShowProductTour("in_progress")).toBe(true);
    expect(shouldShowProductTour("completed")).toBe(false);
    expect(shouldShowProductTour("dismissed")).toBe(false);
  });
});
