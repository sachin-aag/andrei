import { describe, expect, it } from "vitest";
import {
  extractHardFacts,
  placeholderForFactKind,
  replaceFactsWithPlaceholders,
} from "@/lib/ai/chat/claim-facts";

describe("extractHardFacts", () => {
  it("extracts MJ equipment IDs and media-fill serials", () => {
    const facts = extractHardFacts(
      "Filling machines E/PR/070 and E/PR/071 ran APS batch MF-25-VIAL-01."
    );
    expect(facts.map((fact) => fact.text)).toEqual(
      expect.arrayContaining(["E/PR/070", "E/PR/071", "MF-25-VIAL-01"])
    );
    expect(facts.every((fact) => fact.kind === "identifier")).toBe(true);
  });

  it("attaches a same-sentence citation to the fact", () => {
    const facts = extractHardFacts(
      "Equipment E/PR/070 [PQR-24-PR-102.pdf, p. 2] remains qualified."
    );
    const equipment = facts.find((fact) => fact.text === "E/PR/070");
    expect(equipment?.cited).toEqual([
      { filename: "PQR-24-PR-102.pdf", page: 2 },
    ]);
  });

  it("extracts dates, durations, temperatures, and unit numbers", () => {
    const facts = extractHardFacts(
      "Incubation 14 days at 20-25 °C on 12 Jan 2024 filled 10,000 units, contaminated units 0."
    );
    expect(facts.map((fact) => `${fact.kind}:${fact.text}`)).toEqual(
      expect.arrayContaining([
        "duration:14 days",
        "temperature:20-25 °C",
        "date:12 Jan 2024",
        "number:10,000 units",
        "number:0",
      ])
    );
  });

  it("does not treat citation brackets as facts", () => {
    const facts = extractHardFacts("See [PQR-24-PR-102.pdf, p. 2].");
    expect(facts).toEqual([]);
  });
});

describe("replaceFactsWithPlaceholders", () => {
  it("replaces unsupported identifiers from the end so indices stay valid", () => {
    const text = "E/PR/070 then MF-25-VIAL-01";
    const facts = extractHardFacts(text);
    const invented = facts.filter((fact) => fact.text === "MF-25-VIAL-01");
    expect(replaceFactsWithPlaceholders(text, invented)).toBe(
      `E/PR/070 then ${placeholderForFactKind("identifier")}`
    );
  });
});
