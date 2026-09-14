import { describe, expect, it } from "vitest";
import { nextHydratedSectionStamp } from "@/hooks/use-hydrate-autosave-from-section-row";

describe("nextHydratedSectionStamp", () => {
  it("records the first server stamp without marking persisted", () => {
    expect(nextHydratedSectionStamp(null, "2026-01-01T00:00:00.000Z")).toEqual({
      stamp: "2026-01-01T00:00:00.000Z",
      shouldMarkPersisted: false,
    });
  });

  it("marks persisted when a later refresh changes updatedAt", () => {
    expect(
      nextHydratedSectionStamp(
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:01:00.000Z"
      )
    ).toEqual({
      stamp: "2026-01-01T00:01:00.000Z",
      shouldMarkPersisted: true,
    });
  });

  it("does not mark persisted when the row stamp is unchanged", () => {
    expect(
      nextHydratedSectionStamp(
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z"
      )
    ).toEqual({
      stamp: "2026-01-01T00:00:00.000Z",
      shouldMarkPersisted: false,
    });
  });
});
