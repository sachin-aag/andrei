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
  it("stores each statement, including spoken wording with no hyphenated id", () => {
    const rows = extractStatedFactCandidates(
      "URS 3 operating temperature is actually 20 to 130 celsius. i think the attachment has the wrong value"
    );
    expect(rows.map((row) => row.text)).toEqual([
      "URS 3 operating temperature is actually 20 to 130 celsius.",
      "i think the attachment has the wrong value",
    ]);
  });

  it("stores a value that names no identifier", () => {
    const rows = extractStatedFactCandidates("Use −15 °C.");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toBe("Use −15 °C.");
  });

  it("drops a question, a bare yes, and auto-continue", () => {
    expect(extractStatedFactCandidates("What temperature is URS-13?")).toEqual([]);
    expect(extractStatedFactCandidates("yes")).toEqual([]);
    expect(extractStatedFactCandidates("insert that")).toEqual([]);
    expect(extractStatedFactCandidates("thanks")).toEqual([]);
    expect(extractStatedFactCandidates("Continue the remaining sections.")).toEqual(
      []
    );
  });

  it("keeps a statement that follows a question", () => {
    const rows = extractStatedFactCandidates(
      "What about the jacket? URS-13 operating range is −15 °C."
    );
    expect(rows.map((row) => row.text)).toEqual([
      "URS-13 operating range is −15 °C.",
    ]);
  });
});

describe("omitStatedFactsAlreadyInReport", () => {
  it("drops a sentence already written in the report", () => {
    const candidates = extractStatedFactCandidates(
      "URS-13 operating range is −15 °C. The holding tank is stainless."
    );
    const kept = omitStatedFactsAlreadyInReport(
      candidates,
      "Earlier draft. URS-13 operating range is −15 °C."
    );
    expect(kept.map((row) => row.text)).toEqual(["The holding tank is stainless."]);
  });
});

describe("statedFactSupportsDraft", () => {
  const stored = extractStatedFactCandidates(
    "URS-13 operating range is −15 °C."
  );

  it("keeps 20 °C to 130 °C from a spoken sentence and not the file range or another id", () => {
    const spoken = extractStatedFactCandidates(
      "URS 3 operating temperature is actually 20 to 130 celsius."
    );
    const range = tempFact("URS-3 shell operating temperature is 20 °C to 130 °C");
    const fileRange = tempFact("URS-3 requirement is 15 °C to 130 °C");
    const other = tempFact("URS-14 shell operating temperature is 20 °C to 130 °C");
    expect(
      statedFactSupportsDraft({
        fact: range,
        draftContext: "URS-3 shell operating temperature is 20 °C to 130 °C",
        statedFacts: spoken,
      })
    ).toBe(true);
    expect(
      statedFactSupportsDraft({
        fact: fileRange,
        draftContext: "URS-3 requirement is 15 °C to 130 °C",
        statedFacts: spoken,
      })
    ).toBe(false);
    expect(
      statedFactSupportsDraft({
        fact: other,
        draftContext: "URS-14 shell operating temperature is 20 °C to 130 °C",
        statedFacts: spoken,
      })
    ).toBe(false);
  });

  it("keeps the value only when the draft is about the same point", () => {
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
  });

  it("does not treat 15 °C as the stored −15 °C", () => {
    const warm = tempFact("URS-13 was held at 15 °C");
    expect(
      statedFactSupportsDraft({
        fact: warm,
        draftContext: "URS-13 was held at 15 °C",
        statedFacts: stored,
      })
    ).toBe(false);
  });

  it("lets a named attachment quote that shares the point win", () => {
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
  it("lists the sentence and omits author and message ids", () => {
    const block = renderStatedFactsPrompt([
      {
        text: "URS-13 operating range is −15 °C.",
        normalized: "urs-13 operating range is −15 °c",
      },
    ]);
    expect(block).toContain("URS-13 operating range is −15 °C.");
    expect(block).toContain("not a reason to skip search");
    expect(block).toContain("including when an attachment disagrees");
    expect(block).not.toContain("author");
    expect(block).not.toContain("Ada Lovelace");
  });

  it("caps the prompt at the latest rows", () => {
    const facts = Array.from({ length: STATED_FACTS_PROMPT_CAP + 1 }, (_, i) => ({
      text: `Statement number ${i} stays.`,
      normalized: `statement number ${i} stays`,
    }));
    const turned = statedFactsForTurn(facts);
    expect(turned).toHaveLength(STATED_FACTS_PROMPT_CAP);
    expect(turned[0]?.text).toBe("Statement number 1 stays.");
    expect(renderStatedFactsPrompt(facts)).not.toContain("Statement number 0 stays.");
    expect(renderStatedFactsPrompt(facts)).toContain(
      `Statement number ${STATED_FACTS_PROMPT_CAP} stays.`
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
