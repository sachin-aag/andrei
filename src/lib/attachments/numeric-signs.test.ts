import { describe, expect, it } from "vitest";
import { glueOcrMinusSigns, glueOcrUrsIds } from "./numeric-signs";

describe("glueOcrMinusSigns", () => {
  it("turns a figure dash, em dash, or fullwidth minus into a hyphen", () => {
    expect(glueOcrMinusSigns("‒15 °C")).toBe("-15 °C");
    expect(glueOcrMinusSigns("—15 °C")).toBe("-15 °C");
    expect(glueOcrMinusSigns("－15 °C")).toBe("-15 °C");
    expect(glueOcrMinusSigns("‐ 15 °C")).toBe("-15 °C");
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

describe("glueOcrUrsIds", () => {
  it("glues a table/footer wrap of URS-33", () => {
    expect(glueOcrUrsIds("URS- 33 Stage and location")).toBe(
      "URS-33 Stage and location"
    );
    expect(glueOcrUrsIds("URS-\n33 Stage and location")).toBe(
      "URS-33 Stage and location"
    );
    expect(glueOcrUrsIds("URS - 33 Stage and location")).toBe(
      "URS-33 Stage and location"
    );
  });

  it("is a no-op on a clean URS ID and does not turn URS-1 into URS-13", () => {
    expect(glueOcrUrsIds("URS-13 Jacket Type")).toBe("URS-13 Jacket Type");
    expect(glueOcrUrsIds("URS-1 Reactor Capacity URS-13 Jacket Type")).toBe(
      "URS-1 Reactor Capacity URS-13 Jacket Type"
    );
  });
});
