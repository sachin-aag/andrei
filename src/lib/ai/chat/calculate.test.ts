import { describe, expect, it } from "vitest";
import { extractHardFacts } from "@/lib/ai/chat/claim-facts";
import { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import { groundDraftText } from "@/lib/ai/chat/ground-draft";
import {
  calculateExpressions,
  calculationEvidenceFromItem,
  calculationEvidenceFromToolOutput,
  calculationSupportingFact,
  evaluateArithmetic,
  formatCalculationResult,
  isCapabilityIndexLabel,
} from "@/lib/ai/chat/calculate";

describe("evaluateArithmetic", () => {
  it("evaluates the rinse-volume products from table 8", () => {
    const rf = evaluateArithmetic("30.96 × 3");
    expect(rf).toMatchObject({ ok: true, display: "92.88" });
    const saf = evaluateArithmetic("30.96 × 0.2 × 6");
    expect(saf.ok).toBe(true);
    if (!saf.ok) return;
    expect(saf.display).toBe("37.152");
    expect(saf.rounded).toBe(37);
  });

  it("handles + - / parentheses and unary minus", () => {
    expect(evaluateArithmetic("1 + 2 * 3")).toMatchObject({
      ok: true,
      display: "7",
    });
    expect(evaluateArithmetic("(1 + 2) * 3")).toMatchObject({
      ok: true,
      display: "9",
    });
    expect(evaluateArithmetic("10 / 4")).toMatchObject({
      ok: true,
      display: "2.5",
    });
    expect(evaluateArithmetic("-3 + 5")).toMatchObject({
      ok: true,
      display: "2",
    });
    expect(evaluateArithmetic("PDE * MBS / TDD".replace("PDE", "12.5").replace("MBS", "8").replace("TDD", "2"))).toMatchObject(
      { ok: true, display: "50" }
    );
  });

  it("supports sqrt, round, and implied multiplication", () => {
    expect(evaluateArithmetic("sqrt(9) + 1")).toMatchObject({
      ok: true,
      display: "4",
    });
    expect(evaluateArithmetic("√9+1")).toMatchObject({ ok: true, display: "4" });
    expect(evaluateArithmetic("2(3+4)")).toMatchObject({
      ok: true,
      display: "14",
    });
    expect(evaluateArithmetic("round(37.152)")).toMatchObject({
      ok: true,
      display: "37",
    });
    expect(evaluateArithmetic("round(92.88, 1)")).toMatchObject({
      ok: true,
      display: "92.9",
    });
    expect(evaluateArithmetic("2**3")).toMatchObject({ ok: true, display: "8" });
  });

  it("rejects units, division by zero, and empty input", () => {
    expect(evaluateArithmetic("30.96 * 3 L")).toMatchObject({ ok: false });
    expect(evaluateArithmetic("10 / 0")).toMatchObject({
      ok: false,
      error: "Division by zero.",
    });
    expect(evaluateArithmetic("")).toMatchObject({ ok: false });
    expect(evaluateArithmetic("sqrt(-1)")).toMatchObject({ ok: false });
  });
});

describe("calculateExpressions", () => {
  it("returns partial when some expressions fail", () => {
    const batch = calculateExpressions(["30.96 * 3", "10 / 0"]);
    expect(batch.status).toBe("partial");
    expect(batch.results[0]).toMatchObject({ ok: true, display: "92.88" });
    expect(batch.results[1]).toMatchObject({ ok: false });
  });
});

describe("formatCalculationResult", () => {
  it("strips IEEE junk", () => {
    expect(formatCalculationResult(0.1 + 0.2)).toBe("0.3");
  });
});

describe("calculationSupportingFact", () => {
  it("stands behind the computed product, not the operands", () => {
    const rf = evaluateArithmetic("30.96 * 3");
    expect(rf.ok).toBe(true);
    if (!rf.ok) return;
    const evidence = [calculationEvidenceFromItem(rf)];
    const product = extractHardFacts("92.88 L")[0]!;
    expect(calculationSupportingFact(product, evidence)).not.toBeNull();
    const considered = extractHardFacts("37 L")[0]!;
    const saf = evaluateArithmetic("30.96 * 0.2 * 6");
    expect(saf.ok).toBe(true);
    if (!saf.ok) return;
    expect(
      calculationSupportingFact(considered, [calculationEvidenceFromItem(saf)])
    ).not.toBeNull();
    const operand = extractHardFacts("30.96 m²")[0]!;
    expect(calculationSupportingFact(operand, evidence)).toBeNull();
  });

  it("never backs a capability index — those come from a saved analysis", () => {
    const cpk = evaluateArithmetic("(12.81 - 8.0) / (3 * 1.083)");
    expect(cpk.ok).toBe(true);
    if (!cpk.ok) return;
    const evidence = [calculationEvidenceFromItem(cpk)];
    const text = `Cpk ${cpk.display.slice(0, 4)} against LSL 8.0 N.`;
    const fact = extractHardFacts(text).find((f) => f.text.startsWith("1.4"))!;
    expect(fact).toBeDefined();
    expect(calculationSupportingFact(fact, evidence)).not.toBeNull();
    expect(calculationSupportingFact(fact, evidence, text.slice(0, fact.start))).toBeNull();
    expect(isCapabilityIndexLabel("Ppk of ")).toBe(true);
    expect(isCapabilityIndexLabel("Cpu = ")).toBe(true);
    expect(isCapabilityIndexLabel("rinse volume ")).toBe(false);
  });

  it("reads results from a tool output payload", () => {
    const evidence = calculationEvidenceFromToolOutput({
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
    });
    const product = extractHardFacts("92.88 L")[0]!;
    expect(calculationSupportingFact(product, evidence)).not.toBeNull();
  });
});

describe("groundDraftText with calculation evidence", () => {
  function ledgerWith(quote: string): CitationPageLedger {
    const ledger = new CitationPageLedger();
    ledger.record("cpdr.pdf", 8, "a1", { quote });
    return ledger;
  }

  it("blocks a rinse-volume product when calculate did not run", () => {
    const result = groundDraftText({
      text: "Rinse volume RF is 92.88 L [cpdr.pdf, p. 8].",
      ledger: ledgerWith("Internal surface area 30.96 m². RF = 3."),
      policy: "block",
    });
    expect(result.blocked).toBe(true);
  });

  it("writes that product once calculate returned it", () => {
    const rf = evaluateArithmetic("30.96 * 3");
    expect(rf.ok).toBe(true);
    if (!rf.ok) return;
    const result = groundDraftText({
      text: "Rinse volume RF is 92.88 L [cpdr.pdf, p. 8].",
      ledger: ledgerWith("Internal surface area 30.96 m². RF = 3."),
      policy: "block",
      calculations: [calculationEvidenceFromItem(rf)],
    });
    expect(result.blocked).toBe(false);
    expect(result.text).toContain("92.88");
    const claim = result.provenance.claims.find((record) =>
      record.text.includes("92.88")
    );
    expect(claim?.status).toBe("verified");
    expect(claim?.calculation).toMatchObject({ expression: "30.96 * 3" });
  });

  it("blocks a hand-computed Cpk cited to the spreadsheet", () => {
    const cpk = evaluateArithmetic("(12.81 - 8.0) / (3 * 1.083)");
    expect(cpk.ok).toBe(true);
    if (!cpk.ok) return;
    const result = groundDraftText({
      text: "Peel strength Cpk was 1.48 against LSL 8.0 N [cpdr.pdf, p. 8].",
      ledger: ledgerWith("Peel force LSL 8.0 N. Lot A 12.4 13.1 11.9"),
      policy: "block",
      calculations: [calculationEvidenceFromItem(cpk)],
    });
    expect(result.blocked).toBe(true);
    expect(result.text).not.toContain("1.48");
    // The same product with no capability label is still a computed fact.
    const plain = groundDraftText({
      text: "The margin ratio was 1.48 against LSL 8.0 N [cpdr.pdf, p. 8].",
      ledger: ledgerWith("Peel force LSL 8.0 N. Lot A 12.4 13.1 11.9"),
      policy: "block",
      calculations: [calculationEvidenceFromItem(cpk)],
    });
    expect(plain.text).toContain("1.48");
  });

  it("still requires operands to sit on a retrieved page", () => {
    const rf = evaluateArithmetic("30.96 * 3");
    expect(rf.ok).toBe(true);
    if (!rf.ok) return;
    const result = groundDraftText({
      text: "Surface area 30.96 m² and rinse volume 92.88 L [cpdr.pdf, p. 8].",
      ledger: ledgerWith("RF = 3. No area printed here."),
      policy: "block",
      calculations: [calculationEvidenceFromItem(rf)],
    });
    expect(result.blocked).toBe(true);
    expect(result.text).not.toContain("30.96");
    expect(result.text).toContain("92.88");
  });
});
