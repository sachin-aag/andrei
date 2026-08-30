import { describe, expect, it } from "vitest";
import {
  PlaceholderPreservationError,
  filledPlaceholderSlots,
  placeholderPreservationViolations,
} from "./preservation";

describe("filledPlaceholderSlots", () => {
  it("collects labeled filled values and skips unfilled tokens", () => {
    expect(
      filledPlaceholderSlots(
        "Batch [Batch number: B-2024-117] on [date: <to be filled>]."
      )
    ).toEqual([{ label: "Batch number", value: "B-2024-117" }]);
  });
});

describe("placeholderPreservationViolations", () => {
  it("flags a filled value reverted to an unfilled token", () => {
    expect(
      placeholderPreservationViolations(
        "Observed on [detection date: 15/05/2025].",
        "Observed on [detection date: <to be filled>]."
      )
    ).toEqual([
      {
        label: "detection date",
        filledValue: "15/05/2025",
        kind: "reverted_to_unfilled",
      },
    ]);
  });

  it("flags a filled value that vanished", () => {
    expect(
      placeholderPreservationViolations(
        "Batch [Batch number: B-2024-117] failed dissolution.",
        "A batch failed dissolution."
      )
    ).toEqual([
      {
        label: "Batch number",
        filledValue: "B-2024-117",
        kind: "value_vanished",
      },
    ]);
  });

  it("allows a rewrite that keeps the filled value", () => {
    expect(
      placeholderPreservationViolations(
        "Batch [Batch number: B-2024-117] failed.",
        "The affected batch [Batch number: B-2024-117] failed dissolution at 68%."
      )
    ).toEqual([]);
  });

  it("formats PlaceholderPreservationError", () => {
    const err = new PlaceholderPreservationError([
      {
        label: "Batch number",
        filledValue: "B-2024-117",
        kind: "value_vanished",
      },
    ]);
    expect(err.message).toContain("Batch number");
    expect(err.violations).toHaveLength(1);
  });
});
