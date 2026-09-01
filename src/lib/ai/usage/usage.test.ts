import { describe, expect, it } from "vitest";
import { currentYearMonthUtc, monthCycleBoundsUtc } from "./cycle";
import { estimateAiUsageCostUsd } from "./estimate-cost";
import { resolveModelPricing } from "./pricing";
import { normalizeTokenUsage } from "./token-usage";

describe("ai usage cycle", () => {
  it("formats UTC year-month keys", () => {
    expect(currentYearMonthUtc(new Date("2026-08-15T12:00:00.000Z"))).toBe(
      "2026-08"
    );
  });

  it("returns calendar month bounds in UTC", () => {
    const { cycleStart, cycleEnd } = monthCycleBoundsUtc("2026-08");
    expect(cycleStart.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(cycleEnd.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("ai usage pricing", () => {
  it("estimates cost from token counts", () => {
    const pricing = resolveModelPricing("gemini-3.1-flash-lite");
    const cost = estimateAiUsageCostUsd({
      modelId: "gemini-3.1-flash-lite",
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(cost).toBe(pricing.inputPerMillionUsd);
  });

  it("prices 2.5 Flash-Lite cheaper than 3.5 Flash-Lite", () => {
    const lite25 = resolveModelPricing("gemini-2.5-flash-lite");
    const lite35 = resolveModelPricing("gemini-3.5-flash-lite");
    expect(lite25.inputPerMillionUsd).toBe(0.1);
    expect(lite25.outputPerMillionUsd).toBe(0.4);
    expect(lite35.inputPerMillionUsd).toBe(0.3);
    expect(lite35.outputPerMillionUsd).toBe(2.5);
  });

  it("normalizes embedding token usage", () => {
    expect(normalizeTokenUsage({ tokens: 128 })).toEqual({
      inputTokens: 128,
      outputTokens: 0,
    });
  });
});
