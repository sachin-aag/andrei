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

  it("attaches a parked [n] marker via the Citations list", () => {
    const facts = extractHardFacts(
      "Equipment E/PR/070 [1] remains qualified.\n\nCitations:\n1. [PQR-24-PR-102.pdf, p. 2]"
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

  it("extracts URS-N identifiers that the old SOP/ID pattern missed", () => {
    const facts = extractHardFacts("Copy URS-44 Emergency Stop and URS-5 jacket range.");
    expect(facts.map((fact) => fact.text)).toEqual(
      expect.arrayContaining(["URS-44", "URS-5"])
    );
    expect(facts.filter((fact) => fact.kind === "identifier")).toHaveLength(2);
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

describe("instrument quantities", () => {
  function kinds(text: string): Array<[string, string]> {
    return extractHardFacts(text).map((fact) => [fact.kind, fact.text]);
  }

  it("sees a vacuum reading, which the gate was previously blind to", () => {
    // Until these units were listed a model could write any vacuum figure and
    // nothing checked it — the opposite of the risk the plan anticipated.
    expect(kinds("the low was 192.4 µbar")).toContainEqual([
      "number",
      "192.4 µbar",
    ]);
    expect(kinds("held at 802.4 mbar")).toContainEqual(["number", "802.4 mbar"]);
    expect(kinds("2.1 bar in the jacket")).toContainEqual(["number", "2.1 bar"]);
  });

  it("sees minutes and seconds, which an excursion is measured in", () => {
    expect(kinds("for 7 minutes")).toContainEqual(["duration", "7 minutes"]);
    expect(kinds("for 105 min")).toContainEqual(["duration", "105 min"]);
    expect(kinds("after 30 seconds")).toContainEqual(["duration", "30 seconds"]);
  });

  it("sees a clock delta the way an instrument cursor reports one", () => {
    expect(kinds("the cursor read 00:13:39")).toContainEqual([
      "duration",
      "00:13:39",
    ]);
  });

  it("still sees the lab units it always did", () => {
    expect(kinds("10 mL withdrawn")).toContainEqual(["number", "10 mL"]);
    expect(kinds("2 hours later")).toContainEqual(["duration", "2 hours"]);
  });

  it("sees a kg/cm² operating-range pressure", () => {
    expect(kinds("Full Vacuum to 3.5 kg/cm²")).toContainEqual([
      "number",
      "3.5 kg/cm²",
    ]);
    expect(kinds("held at 3.5 kg/cm2")).toContainEqual(["number", "3.5 kg/cm2"]);
  });

  it("does not treat the trailing 0 in 25.0 as a measured zero", () => {
    expect(extractHardFacts("NLT 25.0 m²").map((fact) => fact.text)).not.toContain(
      "0"
    );
    expect(extractHardFacts("0.5 bar").map((fact) => fact.text)).not.toContain("0");
    expect(
      extractHardFacts("contaminated units 0").map((fact) => `${fact.kind}:${fact.text}`)
    ).toContain("number:0");
  });

  it("does not turn a section number into a quantity", () => {
    expect(extractHardFacts("5.1 System Trends")).toEqual([]);
  });

  it("does not treat stainless 316L as a litre quantity", () => {
    expect(extractHardFacts("Glass lined / SS 316L").map((fact) => fact.text)).not.toContain(
      "316L"
    );
    expect(extractHardFacts("Capacity 8000 L").map((fact) => fact.text)).toContain("8000 L");
  });
});
