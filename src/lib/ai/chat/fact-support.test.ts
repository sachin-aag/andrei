import { describe, expect, it } from "vitest";
import { extractHardFacts } from "./claim-facts";
import { CitationPageLedger } from "./citation-grounding";
import {
  classifyLookupFactSupport,
  collectAskEvidence,
  factSupportedByQuote,
  shouldKeepAskFact,
} from "./fact-support";
import type { UIMessage } from "ai";

function areaFact() {
  const facts = extractHardFacts("Heat transfer area is 24.50 m².");
  const match = facts.find((row) => row.text.includes("24.50"));
  if (!match) throw new Error("expected 24.50 fact");
  return match;
}

describe("factSupportedByQuote", () => {
  it("shares Agent quote matching for measured area", () => {
    const fact = areaFact();
    expect(
      factSupportedByQuote("Heat transfer area 24.50 m² measured on the jacket.", fact)
    ).toBe(true);
    expect(
      factSupportedByQuote("Jacket piping size 3.6 inch inlet. Outlet 14.1.", fact)
    ).toBe(false);
  });
});

describe("classifyLookupFactSupport / shouldKeepAskFact", () => {
  it("keeps an attachment fact only when a quote prints it", () => {
    const fact = areaFact();
    fact.cited = [{ filename: "Installation Qualification.PDF", page: 24 }];
    expect(
      classifyLookupFactSupport(fact, {
        quotes: ["Jacket piping size 3.6 inch."],
        reportHaystack: "",
        userHaystack: "",
      })
    ).toBe("none");
    expect(
      shouldKeepAskFact(fact, {
        quotes: ["Jacket piping size 3.6 inch."],
        reportHaystack: "",
        userHaystack: "",
      })
    ).toBe(false);
    expect(
      shouldKeepAskFact(fact, {
        quotes: ["Heat transfer area 24.50 m²."],
        reportHaystack: "",
        userHaystack: "",
      })
    ).toBe(true);
  });

  it("keeps a report-read number without treating it as attachment evidence", () => {
    const fact = areaFact();
    expect(
      classifyLookupFactSupport(fact, {
        quotes: ["Jacket piping size 3.6 inch."],
        reportHaystack: "Table 6 Heat transfer area 24.50 m²",
        userHaystack: "",
      })
    ).toBe("report");
    expect(
      shouldKeepAskFact(fact, {
        quotes: ["Jacket piping size 3.6 inch."],
        reportHaystack: "Table 6 Heat transfer area 24.50 m²",
        userHaystack: "",
      })
    ).toBe(true);
  });

  it("keeps a number the engineer stated this turn", () => {
    const fact = areaFact();
    fact.cited = [{ filename: "Installation Qualification.PDF", page: 24 }];
    expect(
      classifyLookupFactSupport(fact, {
        quotes: ["Jacket piping size 3.6 inch."],
        reportHaystack: "",
        userHaystack: "the jacket area is 24.50 m², is that in the IQ?",
      })
    ).toBe("user");
    expect(
      shouldKeepAskFact(fact, {
        quotes: ["Jacket piping size 3.6 inch."],
        reportHaystack: "",
        userHaystack: "the jacket area is 24.50 m², is that in the IQ?",
      })
    ).toBe(true);
  });

  it("fail-opens when nothing was looked up and the fact has no file cite", () => {
    const fact = areaFact();
    expect(
      shouldKeepAskFact(fact, {
        quotes: [],
        reportHaystack: "",
        userHaystack: "",
      })
    ).toBe(true);
  });
});

describe("collectAskEvidence", () => {
  it("seeds report haystack from read_section fields, not the attachment ledger", () => {
    const ledger = new CitationPageLedger();
    ledger.record("Installation Qualification.PDF", 24, "att-iq", {
      quote: "Jacket piping size 3.6 inch inlet.",
    });
    const messages: UIMessage[] = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "what is the heat transfer area?" }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-read_section",
            toolCallId: "r1",
            state: "output-available",
            input: { section: "cvrp_1" },
            output: {
              section: "cvrp_1",
              fields: [
                {
                  targetField: "table",
                  text: "Table 6 Heat transfer area 24.50 m²",
                  readingText: "Table 6 Heat transfer area 24.50 m²",
                  structuredText: "R1 24.50 m²",
                },
              ],
            },
          },
        ],
      },
    ];
    const evidence = collectAskEvidence({ messages, ledger });
    expect(evidence.quotes.some((quote) => quote.includes("3.6"))).toBe(true);
    expect(evidence.reportHaystack).toContain("24.50 m²");
    expect(evidence.userHaystack).toContain("heat transfer area");
    const fact = areaFact();
    expect(classifyLookupFactSupport(fact, evidence)).toBe("report");
  });

  it("keeps a calculate product as computed evidence", () => {
    const ledger = new CitationPageLedger();
    ledger.record("cpdr.pdf", 8, "att-1", {
      quote: "Internal surface area 30.96 m². RF = 3.",
    });
    const messages: UIMessage[] = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "what is 30.96 × 3?" }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-calculate",
            toolCallId: "c1",
            state: "output-available",
            input: { expressions: ["30.96 * 3"] },
            output: {
              status: "ok",
              results: [
                {
                  ok: true,
                  expression: "30.96 * 3",
                  result: 92.88,
                  display: "92.88",
                  rounded: 93,
                },
              ],
            },
          },
        ],
      },
    ];
    const evidence = collectAskEvidence({ messages, ledger });
    const product = extractHardFacts("92.88 L")[0]!;
    expect(classifyLookupFactSupport(product, evidence)).toBe("computed");
    expect(shouldKeepAskFact(product, evidence)).toBe(true);
    const operand = extractHardFacts("30.96 m²")[0]!;
    expect(classifyLookupFactSupport(operand, evidence)).toBe("quote");
    const invented = extractHardFacts("999 L")[0]!;
    expect(shouldKeepAskFact(invented, evidence)).toBe(false);
  });
});
