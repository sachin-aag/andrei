import { describe, expect, it } from "vitest";
import {
  glueOcrMinusSigns,
  glueOcrUrsIds,
  overlayLeadingMinuses,
  textLayerDroppedCelsiusSign,
} from "./numeric-signs";

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

describe("overlayLeadingMinuses", () => {
  it("copies a leading minus onto unsigned N °C when evidence has -N °C", () => {
    expect(
      overlayLeadingMinuses(
        "than 1 mm\n15 °C to 130 °C\nFull Vacuum",
        "Shell Operating temperature −15 °C to 130 °C"
      )
    ).toBe("than 1 mm\n-15 °C to 130 °C\nFull Vacuum");
  });

  it("copies a leading minus onto URS-37's dropped −20 °C to 150 °C", () => {
    expect(
      overlayLeadingMinuses(
        "URS-37 Temperature\n20 °C to 150\n°C\n0.1°C",
        "To measure the temperature - 20 °C to 150 °C"
      )
    ).toBe("URS-37 Temperature\n-20 °C to 150\n°C\n0.1°C");
  });

  it("does not invent a minus when evidence has none", () => {
    expect(
      overlayLeadingMinuses(
        "15 °C to 130 °C",
        "User requirement 15 °C to 130 °C"
      )
    ).toBe("15 °C to 130 °C");
  });

  it("does not turn an en-dash process range into a signed temperature", () => {
    expect(
      overlayLeadingMinuses("Process temperature 15–130 °C", "-15 °C to 130 °C")
    ).toBe("Process temperature 15–130 °C");
  });
});

describe("textLayerDroppedCelsiusSign", () => {
  it("detects unsigned N °C to after a dropped minus", () => {
    expect(textLayerDroppedCelsiusSign("15 °C to 130 °C")).toBe(true);
    expect(textLayerDroppedCelsiusSign("20 °C to 150\n°C")).toBe(true);
    expect(textLayerDroppedCelsiusSign("-15 °C to 130 °C")).toBe(false);
    expect(textLayerDroppedCelsiusSign("-20 °C to 150 °C")).toBe(false);
    expect(textLayerDroppedCelsiusSign("Process temperature 15–130 °C")).toBe(
      false
    );
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
