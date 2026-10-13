import { describe, expect, it } from "vitest";
import { extractHardFacts } from "@/lib/ai/chat/claim-facts";
import {
  englishTextForStatedFacts,
  extractStatedFactCandidates,
  omitStatedFactsAlreadyInReport,
  renderStatedFactsPrompt,
  STATED_FACTS_PROMPT_CAP,
  statedFactSupportsDraft,
  statedFactsForTurn,
} from "@/lib/ai/chat/stated-facts";

function tempFact(text: string) {
  const fact = extractHardFacts(text).find((row) => row.kind === "temperature");
  if (!fact) throw new Error(`no temperature in ${text}`);
  return fact;
}

describe("extractStatedFactCandidates", () => {
  it("binds a quantity to each identifier in the same sentence", () => {
    const rows = extractStatedFactCandidates(
      "URS-13 and URS-14 operating range is −15 °C."
    );
    expect(rows.map((row) => row.entityText).sort()).toEqual(["URS-13", "URS-14"]);
    expect(rows.every((row) => row.valueKind === "temperature")).toBe(true);
    expect(new Set(rows.map((row) => row.valueNormalized)).size).toBe(1);
  });

  it("stores an assigned identifier on the report", () => {
    const rows = extractStatedFactCandidates("The batch is MF-25-VIAL-01.");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entityText: "",
      valueKind: "identifier",
      valueText: "MF-25-VIAL-01",
    });
  });

  it("stores a spoken URS id and the word celsius", () => {
    const rows = extractStatedFactCandidates(
      "URS 3 operating temperature is actually 20 to 130 celsius. i think the attachment has the wrong value"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entityText: "URS-3",
      valueKind: "temperature",
      valueText: "20 to 130 °C",
    });
    expect(rows[0]?.sourceText).toContain("URS 3 operating temperature");
    expect(rows[0]?.sourceText).toContain("celsius");
  });

  it("drops a quantity with no identifier, a draft command, a question, and a bare yes", () => {
    expect(extractStatedFactCandidates("Use −15 °C.")).toEqual([]);
    expect(extractStatedFactCandidates("Draft URS-13.")).toEqual([]);
    expect(extractStatedFactCandidates("What temperature is URS-13?")).toEqual([]);
    expect(extractStatedFactCandidates("yes")).toEqual([]);
    expect(extractStatedFactCandidates("insert that")).toEqual([]);
    expect(extractStatedFactCandidates("Continue the remaining sections.")).toEqual(
      []
    );
  });

  it("keeps a stated fact in a later sentence that is not a question", () => {
    const rows = extractStatedFactCandidates(
      "What about the jacket? URS-13 operating range is −15 °C."
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.entityText).toBe("URS-13");
  });
});

describe("omitStatedFactsAlreadyInReport", () => {
  it("drops a pair already written in the report and keeps one whose entity is absent", () => {
    const candidates = extractStatedFactCandidates(
      "URS-13 operating range is −15 °C. URS-14 operating range is −15 °C."
    );
    const kept = omitStatedFactsAlreadyInReport(
      candidates,
      "URS-13 operating range −15 °C is already drafted."
    );
    expect(kept.map((row) => row.entityText)).toEqual(["URS-14"]);
  });
});

describe("statedFactSupportsDraft", () => {
  const stored = extractStatedFactCandidates(
    "URS-13 operating range is −15 °C."
  );

  it("keeps 20 °C to 130 °C when the engineer said 20 to 130 celsius", () => {
    const stored = extractStatedFactCandidates(
      "URS 3 operating temperature is actually 20 to 130 celsius."
    );
    const range = tempFact("URS-3 shell operating temperature is 20 °C to 130 °C");
    const fileRange = tempFact("URS-3 requirement is 15 °C to 130 °C");
    const other = tempFact("URS-14 shell operating temperature is 20 °C to 130 °C");
    expect(
      statedFactSupportsDraft({
        fact: range,
        draftContext: "URS-3 shell operating temperature is 20 °C to 130 °C",
        statedFacts: stored,
      })
    ).toBe(true);
    expect(
      statedFactSupportsDraft({
        fact: fileRange,
        draftContext: "URS-3 requirement is 15 °C to 130 °C",
        statedFacts: stored,
      })
    ).toBe(false);
    expect(
      statedFactSupportsDraft({
        fact: other,
        draftContext: "URS-14 shell operating temperature is 20 °C to 130 °C",
        statedFacts: stored,
      })
    ).toBe(false);
  });

  it("keeps the value only when the draft names the same identifier", () => {
    const cold = tempFact("URS-13 was held at −15 °C");
    const other = tempFact("URS-14 was held at −15 °C");
    expect(
      statedFactSupportsDraft({
        fact: cold,
        draftContext: "URS-13 was held at −15 °C",
        statedFacts: stored,
      })
    ).toBe(true);
    expect(
      statedFactSupportsDraft({
        fact: other,
        draftContext: "URS-14 was held at −15 °C",
        statedFacts: stored,
      })
    ).toBe(false);
    const entity = extractHardFacts("URS-13 was held at −15 °C").find(
      (row) => row.kind === "identifier"
    );
    expect(entity).toBeTruthy();
    expect(
      statedFactSupportsDraft({
        fact: entity!,
        draftContext: "URS-13 was held at −15 °C",
        statedFacts: stored,
      })
    ).toBe(true);
  });

  it("does not treat 15 °C or 15 L as the stored −15 °C", () => {
    const plus = tempFact("URS-13 was held at 15 °C");
    const litres = extractHardFacts("URS-13 holds 15 L").find(
      (row) => row.kind === "number"
    );
    expect(litres).toBeTruthy();
    expect(
      statedFactSupportsDraft({
        fact: plus,
        draftContext: "URS-13 was held at 15 °C",
        statedFacts: stored,
      })
    ).toBe(false);
    expect(
      statedFactSupportsDraft({
        fact: litres!,
        draftContext: "URS-13 holds 15 L",
        statedFacts: stored,
      })
    ).toBe(false);
  });

  it("lets a named attachment quote that mentions the entity win", () => {
    const cold = tempFact("URS-13 was held at −15 °C");
    expect(
      statedFactSupportsDraft({
        fact: cold,
        draftContext: "URS-13 was held at −15 °C",
        statedFacts: stored,
        namedFileQuotes: ["URS-13 setpoint 20 °C on the cover."],
      })
    ).toBe(false);
    expect(
      statedFactSupportsDraft({
        fact: cold,
        draftContext: "URS-13 was held at −15 °C",
        statedFacts: stored,
        namedFileQuotes: ["Ambient warehouse conditions only."],
      })
    ).toBe(true);
  });
});

describe("renderStatedFactsPrompt", () => {
  it("lists fact text and omits author and message ids", () => {
    const block = renderStatedFactsPrompt([
      {
        entityText: "URS-13",
        entityNormalized: "URS-13",
        valueText: "−15 °C",
        valueKind: "temperature",
        valueNormalized: "-15c",
      },
    ]);
    expect(block).toContain("URS-13: −15 °C");
    expect(block).toContain("not a reason to skip search");
    expect(block).toContain("including when an attachment states a different value");
    expect(block).not.toContain("author");
    expect(block).not.toContain("Ada Lovelace");
  });

  it("caps the prompt at the latest rows", () => {
    const facts = Array.from({ length: STATED_FACTS_PROMPT_CAP + 1 }, (_, i) => ({
      entityText: "URS-1",
      entityNormalized: "URS-1",
      valueText: `${i} °C`,
      valueKind: "temperature" as const,
      valueNormalized: `${i}c`,
    }));
    const turned = statedFactsForTurn(facts);
    expect(turned).toHaveLength(STATED_FACTS_PROMPT_CAP);
    expect(turned[0]?.valueText).toBe("1 °C");
    expect(renderStatedFactsPrompt(facts)).not.toContain("- URS-1: 0 °C");
    expect(renderStatedFactsPrompt(facts)).toContain(
      `- URS-1: ${STATED_FACTS_PROMPT_CAP} °C`
    );
  });
});

describe("englishTextForStatedFacts", () => {
  it("leaves English unchanged and translates Devanagari", async () => {
    const english = await englishTextForStatedFacts(
      "URS-13 is −15 °C.",
      async () => {
        throw new Error("should not translate");
      }
    );
    expect(english).toEqual({ english: "URS-13 is −15 °C.", original: null });

    const translated = await englishTextForStatedFacts(
      "URS-13 का तापमान −15 °C है",
      async () => "URS-13 operating range is −15 °C."
    );
    expect(translated?.original).toContain("तापमान");
    expect(translated?.english).toContain("URS-13");
  });

  it("stores nothing when translation fails", async () => {
    const failed = await englishTextForStatedFacts("तापमान", async () => null);
    expect(failed).toBeNull();
  });
});
