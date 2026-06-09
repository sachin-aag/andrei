import { describe, expect, it } from "vitest";
import {
  buildPlainTextSuggestionPreview,
  splitPlainTextPreviewSegments,
} from "./plain-text-preview";

describe("buildPlainTextSuggestionPreview", () => {
  it("adds a leading space on pure insert after a word", () => {
    const value =
      "system is working as per its intended use therefore, the following";
    const segments = buildPlainTextSuggestionPreview(
      value,
      "",
      "regarding the root cause",
      "use"
    );
    expect(segments).toEqual([
      { kind: "context", text: "system is working as per its intended use" },
      { kind: "insert", text: " regarding the root cause" },
      {
        kind: "context",
        text: " therefore, the following",
      },
    ]);
  });

  it("returns null when anchor matches more than once", () => {
    const value = "use the tool and use the spare";
    expect(
      buildPlainTextSuggestionPreview(value, "", "extra", "use")
    ).toBeNull();
  });

  it("includes hence in the delete segment when anchored", () => {
    const value =
      "wavelength accuracy standard solution, hence by considering the isolated instance preventive action not anticipated for the occurred nonconformance, however to avoid the reoccurrence, tail";
    const segments = buildPlainTextSuggestionPreview(
      value,
      "hence by considering the isolated instance preventive action not anticipated for the occurred nonconformance, however to avoid the reoccurrence,",
      "to avoid recurrence,",
      "standard solution, hence by considering the isolated instance preventive action not anticipated for the occurred nonconformance, however to avoid the reoccurrence,"
    );
    expect(segments).not.toBeNull();
    const del = segments!.find((s) => s.kind === "delete");
    expect(del?.text.startsWith("hence")).toBe(true);
  });

  it("wraps a delete/insert in context", () => {
    const value =
      "hence there is no requirement of Corrective Action.";
    const segments = buildPlainTextSuggestionPreview(
      value,
      "hence there is no requirement of Corrective Action.",
      "therefore, the following specific preventive action is proposed."
    );
    expect(segments).toEqual([
      { kind: "context", text: "" },
      {
        kind: "delete",
        text: "hence there is no requirement of Corrective Action.",
      },
      {
        kind: "insert",
        text: "therefore, the following specific preventive action is proposed.",
      },
      { kind: "context", text: "" },
    ]);
  });
});

describe("splitPlainTextPreviewSegments", () => {
  it("isolates delete/insert from trailing context", () => {
    const segments = buildPlainTextSuggestionPreview(
      "abc OLD rest",
      "OLD",
      "NEW"
    )!;
    const split = splitPlainTextPreviewSegments(segments);
    expect(split.before).toEqual([{ kind: "context", text: "abc " }]);
    expect(split.suggestion).toEqual([
      { kind: "delete", text: "OLD" },
      { kind: "insert", text: "NEW" },
    ]);
    expect(split.after).toEqual([{ kind: "context", text: " rest" }]);
  });
});
