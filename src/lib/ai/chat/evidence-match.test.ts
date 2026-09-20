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
