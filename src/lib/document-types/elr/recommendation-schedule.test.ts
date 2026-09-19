import { describe, expect, it } from "vitest";
import {
  recommendationHasCalendarDate,
  recommendationHasFrequency,
  recommendationHasSchedule,
  recommendationHasVagueTiming,
  recommendationMentionsDate,
} from "./recommendation-schedule";

describe("recommendation schedule", () => {
  it("accepts ISO, numeric and month-name calendar dates", () => {
    expect(recommendationHasCalendarDate("Next PRQ is due 2027-08-15.")).toBe(
      true
    );
    expect(
      recommendationHasCalendarDate("CAPA closes on 31 October 2026.")
    ).toBe(true);
    expect(recommendationHasCalendarDate("Review in Oct 2026.")).toBe(true);
    expect(recommendationHasCalendarDate("No action required.")).toBe(false);
  });

  it("accepts annual, quarterly and every-N frequency phrasing", () => {
    expect(recommendationHasFrequency("yearly VMP cycle")).toBe(true);
    expect(recommendationHasFrequency("annual ELR")).toBe(true);
    expect(
      recommendationHasFrequency("effectiveness check every 3 months")
    ).toBe(true);
    expect(recommendationHasFrequency("quarterly quality review")).toBe(true);
    expect(recommendationHasFrequency("No action required.")).toBe(false);
  });

  it("requires both a date and a frequency for a complete schedule", () => {
    expect(
      recommendationHasSchedule(
        "Next PRQ is due 15 August 2027 on the yearly VMP cycle."
      )
    ).toBe(true);
    expect(recommendationHasSchedule("Next PRQ is due 15 August 2027.")).toBe(
      false
    );
    expect(recommendationHasSchedule("Continue the yearly VMP cycle.")).toBe(
      false
    );
  });

  it("matches a title-page ISO date against prose variants", () => {
    const prose =
      "Next periodic re-qualification is due 15 August 2027 on the yearly VMP cycle.";
    expect(recommendationMentionsDate(prose, "2027-08-15")).toBe(true);
    expect(recommendationMentionsDate(prose, "2027-03-31")).toBe(false);
    expect(recommendationMentionsDate("due 15/08/2027 annually", "2027-08-15")).toBe(
      true
    );
  });

  it("flags vague timing words", () => {
    expect(recommendationHasVagueTiming("Close the CAPA soon.")).toBe(true);
    expect(recommendationHasVagueTiming("Monitor as required.")).toBe(true);
    expect(
      recommendationHasVagueTiming(
        "Next PRQ is due 15 August 2027 on the yearly VMP cycle."
      )
    ).toBe(false);
  });
});
