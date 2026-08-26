import { describe, expect, it } from "vitest";
import {
  fCdf,
  fSurvival,
  regularizedIncompleteBeta,
  studentTCritical,
  studentTTwoTailedP,
} from "./incomplete-beta";

describe("regularized incomplete beta and F/t tails", () => {
  it("matches symmetric beta identities", () => {
    expect(regularizedIncompleteBeta(0.5, 1, 1)).toBeCloseTo(0.5, 10);
    expect(regularizedIncompleteBeta(0.5, 2, 2)).toBeCloseTo(0.5, 10);
    expect(regularizedIncompleteBeta(0, 2, 3)).toBe(0);
    expect(regularizedIncompleteBeta(1, 2, 3)).toBe(1);
  });

  it("matches published F critical values at alpha 0.05", () => {
    expect(fSurvival(7.708647, 1, 4)).toBeCloseTo(0.05, 4);
    expect(fSurvival(3.31583, 2, 30)).toBeCloseTo(0.05, 4);
    expect(fCdf(7.708647, 1, 4)).toBeCloseTo(0.95, 4);
  });

  it("handles F boundary values used by ANOVA", () => {
    expect(fSurvival(0, 1, 4)).toBe(1);
    expect(fSurvival(Number.POSITIVE_INFINITY, 1, 4)).toBe(0);
  });

  it("matches the two-tailed t critical value t_4,0.025", () => {
    const t = studentTCritical(4, 0.05);
    expect(t).toBeCloseTo(2.776445, 4);
    expect(studentTTwoTailedP(t, 4)).toBeCloseTo(0.05, 4);
    expect(studentTTwoTailedP(0, 4)).toBe(1);
  });
});
