import { describe, expect, it } from "vitest";
import {
  isProductTourPausedForSession,
  productTourPauseToken,
  productTourSessionKeyFromAuth,
  shouldShowProductTour,
} from "@/lib/walkthrough/progress";

describe("product tour pause token", () => {
  it("does not treat a previous login's skip as paused", () => {
    const userId = "u1";
    const firstLogin = "2026-08-25T08:00:00.000Z";
    const secondLogin = "2026-08-25T09:00:00.000Z";
    const stored = productTourPauseToken(userId, firstLogin);

    expect(isProductTourPausedForSession(stored, userId, firstLogin)).toBe(true);
    expect(isProductTourPausedForSession(stored, userId, secondLogin)).toBe(
      false
    );
  });

  it("ignores a legacy user-only pause value", () => {
    expect(isProductTourPausedForSession("u1", "u1", "2026-08-25T08:00:00.000Z")).toBe(
      false
    );
  });

  it("does not pause when the auth session key is missing", () => {
    expect(isProductTourPausedForSession("u1:exp", "u1", "")).toBe(false);
  });

  it("reads expires from the auth session", () => {
    expect(
      productTourSessionKeyFromAuth({ expires: "2026-08-25T08:00:00.000Z" })
    ).toBe("2026-08-25T08:00:00.000Z");
    expect(productTourSessionKeyFromAuth(null)).toBe("");
  });
});

describe("shouldShowProductTour", () => {
  it("shows not_started and in_progress only", () => {
    expect(shouldShowProductTour("not_started")).toBe(true);
    expect(shouldShowProductTour("in_progress")).toBe(true);
    expect(shouldShowProductTour("completed")).toBe(false);
    expect(shouldShowProductTour("dismissed")).toBe(false);
  });
});
