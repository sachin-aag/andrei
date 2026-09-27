import { describe, expect, it } from "vitest";
import { glueOcrMinusSigns } from "./numeric-signs";

describe("glueOcrMinusSigns", () => {
  it("turns a unicode minus or en-dash sign into a hyphen", () => {
    expect(glueOcrMinusSigns("−15 °C")).toBe("-15 °C");
    expect(glueOcrMinusSigns("–15 °C")).toBe("-15 °C");
  });

  it("glues an OCR-split minus from the URS temperature cell", () => {
    expect(glueOcrMinusSigns("- 15 °C")).toBe("-15 °C");
    expect(glueOcrMinusSigns("− 15 °C to 130 °C")).toBe("-15 °C to 130 °C");
    expect(glueOcrMinusSigns("- 20 °C to 150 °C")).toBe("-20 °C to 150 °C");
  });

  it("keeps an en-dash range separator between digits", () => {
    expect(glueOcrMinusSigns("15–130 °C")).toBe("15–130 °C");
    expect(glueOcrMinusSigns("-15–130 °C")).toBe("-15–130 °C");
  });
});
