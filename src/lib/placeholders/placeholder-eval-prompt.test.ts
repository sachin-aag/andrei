import { describe, expect, it } from "vitest";
import { plainTextHasEvalPlaceholders } from "./placeholder-eval-prompt";

describe("placeholder-eval-prompt", () => {
  it("detects placeholder spans in plain text", () => {
    expect(plainTextHasEvalPlaceholders("No tokens here.")).toBe(false);
    expect(plainTextHasEvalPlaceholders("[Room ID: <to be filled>]")).toBe(true);
  });
});
