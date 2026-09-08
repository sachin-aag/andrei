import { afterEach, describe, expect, it } from "vitest";
import {
  beginSessionHold,
  hasActiveSessionHold,
  resetSessionHoldsForTests,
} from "./session-activity";

describe("session holds", () => {
  afterEach(() => {
    resetSessionHoldsForTests();
  });

  it("tracks overlapping holds by id", () => {
    expect(hasActiveSessionHold()).toBe(false);
    const releaseA = beginSessionHold("a");
    const releaseB = beginSessionHold("b");
    expect(hasActiveSessionHold()).toBe(true);
    releaseA();
    expect(hasActiveSessionHold()).toBe(true);
    releaseB();
    expect(hasActiveSessionHold()).toBe(false);
  });

  it("is idempotent for the same id", () => {
    const releaseFirst = beginSessionHold("upload");
    const releaseSecond = beginSessionHold("upload");
    expect(hasActiveSessionHold()).toBe(true);
    releaseFirst();
    expect(hasActiveSessionHold()).toBe(false);
    releaseSecond();
    expect(hasActiveSessionHold()).toBe(false);
  });
});
