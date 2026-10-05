import { describe, expect, it } from "vitest";
import { extractHardFacts } from "@/lib/ai/chat/claim-facts";
import { evidenceContainsFact } from "@/lib/ai/chat/evidence-match";

function fact(text: string, kindHint?: string) {
  const facts = extractHardFacts(text);
  const match = kindHint
    ? facts.find((row) => row.kind === kindHint)
    : facts[0];
  if (!match) throw new Error(`no fact in ${text}`);
  return match;
}

describe("evidenceContainsFact", () => {
  it("matches equipment IDs despite surrounding OCR noise", () => {
    const equipment = fact("Equipment E/PR/070");
    expect(
      evidenceContainsFact(
        "This PQR covers filling machines E/PR/070 and E/PR/071.",
        equipment
      )
    ).toBe(true);
  });

  it("matches 10,000 against 10000", () => {
    const count = fact("filled 10,000 units");
    expect(evidenceContainsFact("Units filled 10000", count)).toBe(true);
  });

  it("matches 5,000 against a comma-formatted fill volume", () => {
    const count = fact("filled 5,000 units");
    expect(
      evidenceContainsFact(
        "Aseptic process simulation MF-24-VIAL-01: 5,000 units filled, contaminated units 0.",
        count
      )
    ).toBe(true);
  });

  it("does not match an invented media-fill serial", () => {
    const invented = fact("APS batch MF-25-VIAL-01");
    expect(
      evidenceContainsFact(
        "1.0 Purpose This Periodic Quality Review covers filling machines E/PR/070.",
        invented
      )
    ).toBe(false);
  });

  it("never matches an empty haystack", () => {
    expect(evidenceContainsFact("   ", fact("E/PR/070"))).toBe(false);
  });

  it("does not treat a lone 0 as present because E/PR/070 or 1.0 contains a zero", () => {
    const zero = fact("contaminated units 0.", "number");
    expect(
      evidenceContainsFact(
        "1.0 Purpose covers Isolator Filling Machine E/PR/070. Review period 01 January 2024.",
        zero
      )
    ).toBe(false);
    expect(
      evidenceContainsFact("Aseptic process simulation: contaminated units 0.", zero)
    ).toBe(true);
  });

  it("does not treat 3 mL as present because 3.2 mL contains a 3", () => {
    const threeMl = fact("Cartridge 3 mL", "number");
    expect(evidenceContainsFact("Leak test Cartridge 3.2 mL qty 8.", threeMl)).toBe(
      false
    );
    expect(evidenceContainsFact("Fill volume 3 mL cartridge.", threeMl)).toBe(true);
  });

  it("does not treat 15 °C as present because the URS shows −15 °C", () => {
    const fifteen = fact("Minimum 15 °C", "temperature");
    expect(fifteen.text).toContain("15");
    expect(fifteen.text).not.toMatch(/[-−]/);
    expect(
      evidenceContainsFact(
        "URS-3 Shell Operating temperature −15 °C to 130 °C",
        fifteen
      )
    ).toBe(false);
    expect(
      evidenceContainsFact(
        "URS-3 Shell Operating temperature -15 °C to 130 °C",
        fifteen
      )
    ).toBe(false);
    const minusFifteen = fact("Minimum −15 °C", "temperature");
    expect(
      evidenceContainsFact(
        "URS-3 Shell Operating temperature −15 °C to 130 °C",
        minusFifteen
      )
    ).toBe(true);
    expect(
      evidenceContainsFact(
        "URS-3 Shell Operating temperature - 15 °C to 130 °C",
        minusFifteen
      )
    ).toBe(true);
  });

  it("still matches an unsigned 15–130 °C range", () => {
    const range = fact("15–130 °C", "temperature");
    expect(evidenceContainsFact("Process temperature 15–130 °C", range)).toBe(
      true
    );
  });

  it("does not treat 20 °C as present because URS-37 shows −20 °C to 150 °C", () => {
    const twenty = fact("20 °C", "temperature");
    const quote =
      "URS-37 Temperature To measure the temperature - 20 °C to 150 °C";
    expect(evidenceContainsFact(quote, twenty)).toBe(false);
    const unsignedRange = fact("20 °C to 150 °C", "temperature");
    expect(evidenceContainsFact(quote, unsignedRange)).toBe(false);
    const signedRange = fact("-20 °C to 150 °C", "temperature");
    expect(evidenceContainsFact(quote, signedRange)).toBe(true);
    expect(
      evidenceContainsFact(
        "URS-37 Temperature To measure the temperature - 20 °C to 150\n°C",
        signedRange
      )
    ).toBe(true);
  });

  it("does not treat 50 ± 10 RPM as present because the URS shows −50 ± 10 RPM", () => {
    const unsigned = fact("50 ± 10 RPM", "number");
    expect(unsigned.text).toContain("50");
    expect(unsigned.text).not.toMatch(/^[-−]/);
    expect(
      evidenceContainsFact("URS-10 RPM requirement –50 ± 10 RPM", unsigned)
    ).toBe(false);
    expect(
      evidenceContainsFact("URS-10 RPM requirement 50+-10 RPM", unsigned)
    ).toBe(true);
    const signed = fact("–50 ± 10 RPM", "number");
    expect(
      evidenceContainsFact("URS-10 RPM requirement –50 ± 10 RPM", signed)
    ).toBe(true);
    expect(
      evidenceContainsFact("URS-10 RPM requirement -50 ± 10 RPM", signed)
    ).toBe(true);
  });

  it("treats a leading tilde as approximate, not a minus", () => {
    const unsigned = fact("50 ± 10 RPM", "number");
    expect(
      evidenceContainsFact("URS-10 RPM requirement ~50±10 RPM", unsigned)
    ).toBe(true);
    const signed = fact("–50 ± 10 RPM", "number");
    expect(
      evidenceContainsFact("URS-10 RPM requirement ~50±10 RPM", signed)
    ).toBe(false);
  });

  it("matches OCR-split 3.5 Kg/cm² from the URS pressure row", () => {
    const pressure = fact("Full Vacuum to 3.5 Kg/cm²", "number");
    expect(pressure.text).toContain("3.5");
    expect(
      evidenceContainsFact(
        "URS-4 Shell Operating pressure Full Vacuum to 3 . 5 Kg/cm²",
        pressure
      )
    ).toBe(true);
    expect(
      evidenceContainsFact(
        "URS-4 Shell Operating pressure Full Vacuum to 3. 5 Kg/cm²",
        pressure
      )
    ).toBe(true);
    expect(
      evidenceContainsFact("URS-4 Shell Operating pressure Full Vacuum to 3 · 5 Kg/cm2", pressure)
    ).toBe(true);
  });

  it("matches URS-33 when OCR wraps the hyphen at a table footer", () => {
    const id = fact("URS-33");
    expect(id.kind).toBe("identifier");
    expect(
      evidenceContainsFact(
        "URS-32 Location URS- 33 Stage and location Format. No.:-QAD-SOP-FS-003-F03-00",
        id
      )
    ).toBe(true);
    expect(
      evidenceContainsFact("URS-32 Location URS-\n33 Stage and location", id)
    ).toBe(true);
  });

  it("does not treat integer 3 as present because OCR-split 3.5 contains a 3", () => {
    const three = fact("Jacket 3 Kg/cm²", "number");
    expect(
      evidenceContainsFact(
        "URS-4 Shell Operating pressure Full Vacuum to 3 . 5 Kg/cm²",
        three
      )
    ).toBe(false);
    expect(
      evidenceContainsFact("URS-6 Jacket Operating Pressure 3 to 5 Kg/cm²", three)
    ).toBe(true);
  });

  it("matches integer 1600 L against OCR Qty: 1600.0 L", () => {
    const volume = fact("Simulation trial 1600 L", "number");
    expect(
      evidenceContainsFact(
        "8.2.4 Simulation. Qty: 1600.0 L 2. Note: Close the manhole",
        volume
      )
    ).toBe(true);
    expect(
      evidenceContainsFact("Qty: 1600.5 L 2. Note: Close the manhole", volume)
    ).toBe(false);
  });

  it("matches 2.5 Kg/cm² when OCR prints a numbered row as 1. 2.5", () => {
    const pressure = fact("2.5 Kg/cm² to Full Vacuum", "number");
    expect(pressure.text).toContain("2.5");
    expect(
      evidenceContainsFact(
        "Coil/jacket side Reactor (GLR-1301) VESSEL (VES-1308) 1. 2.5 Kg/cm² to Full Vacuum NLT 0.5 Kg/cm² Operating pressure Kg/cm² 8.3 View lamp",
        pressure
      )
    ).toBe(true);
  });

  it("matches 9320 L when the unit sits in the column header", () => {
    const overflow = fact("Overflow volume 9320 L", "number");
    expect(
      evidenceContainsFact(
        "cable 1200 NA 5 Full volume (L) 8000 6 Over flow volume (L) 9320 Format No.",
        overflow
      )
    ).toBe(true);
  });

  it("matches 14 days against a spaced incubation line", () => {
    const duration = fact("Incubation 14 days");
    expect(
      evidenceContainsFact(
        "Aseptic process simulation MF-24-001: 14 days incubation, contaminated units 0.",
        duration
      )
    ).toBe(true);
  });
});
