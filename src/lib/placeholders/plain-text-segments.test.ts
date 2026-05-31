import { describe, expect, it } from "vitest";
import { splitPlainTextWithPlaceholders } from "./plain-text-segments";

describe("splitPlainTextWithPlaceholders", () => {
  it("splits multiple CAPA placeholders in one suggestion insert", () => {
    const text =
      "The corrective action is assigned [CAPA number: <to be filled>], responsible person: [Responsible person: <to be filled>], and due date: [Due date: <to be filled>].";

    const parts = splitPlainTextWithPlaceholders(text);
    const placeholders = parts.filter((p) => p.kind === "placeholder");

    expect(placeholders).toHaveLength(3);
    expect(placeholders.map((p) => p.text)).toEqual([
      "[CAPA number: <to be filled>]",
      "[Responsible person: <to be filled>]",
      "[Due date: <to be filled>]",
    ]);
  });
});
