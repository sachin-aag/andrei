import { describe, expect, it } from "vitest";
import { trackChangesOverlaySegments } from "@/lib/suggestions/plain-text-track-changes";

describe("trackChangesOverlaySegments", () => {
  it("returns null when nothing changed", () => {
    expect(trackChangesOverlaySegments("hello", "hello")).toBeNull();
  });

  it("marks appended typing as insert", () => {
    expect(trackChangesOverlaySegments("Not Applicable", "Not Applicable extra")).toEqual(
      [
        { kind: "context", text: "Not Applicable" },
        { kind: "insert", text: " extra" },
      ]
    );
  });

  it("marks a mid-field insertion without restyling the surrounding text", () => {
    expect(trackChangesOverlaySegments("hello world", "hello new world")).toEqual([
      { kind: "context", text: "hello " },
      { kind: "insert", text: "new " },
      { kind: "context", text: "world" },
    ]);
  });

  it("marks a whole-field replacement as insert", () => {
    expect(trackChangesOverlaySegments("", "Team listed three causes")).toEqual([
      { kind: "insert", text: "Team listed three causes" },
    ]);
  });

  it("does not paint remaining text as insert after a deletion", () => {
    expect(trackChangesOverlaySegments("Not Applicable", "Not")).toEqual(null);
  });
});
