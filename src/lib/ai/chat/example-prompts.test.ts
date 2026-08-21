import { describe, expect, it } from "vitest";
import { DEFAULT_CHAT_COMPOSER_PREFS } from "./composer-prefs";
import { EXAMPLE_PROMPTS, examplePromptsForMode } from "./example-prompts";

describe("examplePromptsForMode", () => {
  it("returns the Ask and Agent chip lists", () => {
    expect(examplePromptsForMode("plan")).toEqual(EXAMPLE_PROMPTS.plan);
    expect(examplePromptsForMode("agent")).toEqual(EXAMPLE_PROMPTS.agent);
  });

  it("does not throw when mode is missing after a composer remount", () => {
    expect(examplePromptsForMode("")).toEqual(
      EXAMPLE_PROMPTS[DEFAULT_CHAT_COMPOSER_PREFS.mode]
    );
    expect(examplePromptsForMode(undefined)).toEqual(EXAMPLE_PROMPTS.agent);
  });
});
