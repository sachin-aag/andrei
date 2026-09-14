import { describe, expect, it } from "vitest";
import {
  looksLikeTexFormula,
  simpleLatexToPlainText,
  simpleLatexToTextNodes,
} from "@/lib/math/simple-latex";

describe("looksLikeTexFormula", () => {
  it("accepts chemical subscripts and commands", () => {
    expect(looksLikeTexFormula("N_2")).toBe(true);
    expect(looksLikeTexFormula(String.raw`\pm 20\%`)).toBe(true);
    expect(looksLikeTexFormula("x^{2}")).toBe(true);
  });

  it("rejects currency-like spans", () => {
    expect(looksLikeTexFormula("100-")).toBe(false);
    expect(looksLikeTexFormula("5.00")).toBe(false);
  });
});

describe("simpleLatexToTextNodes", () => {
  it("turns N_2 into N plus a subscript 2", () => {
    expect(simpleLatexToTextNodes("N_2")).toEqual([
      { type: "text", text: "N" },
      { type: "text", text: "2", marks: [{ type: "subscript" }] },
    ]);
  });

  it("handles H_2O and braced N_{2}", () => {
    expect(simpleLatexToTextNodes("H_2O")).toEqual([
      { type: "text", text: "H" },
      { type: "text", text: "2", marks: [{ type: "subscript" }] },
      { type: "text", text: "O" },
    ]);
    expect(simpleLatexToTextNodes("N_{2}")).toEqual([
      { type: "text", text: "N" },
      { type: "text", text: "2", marks: [{ type: "subscript" }] },
    ]);
  });

  it("turns x^2 into a superscript", () => {
    expect(simpleLatexToTextNodes("x^2")).toEqual([
      { type: "text", text: "x" },
      { type: "text", text: "2", marks: [{ type: "superscript" }] },
    ]);
  });

  it("carries extra marks onto every run", () => {
    const italic = [{ type: "italic" }];
    expect(simpleLatexToTextNodes("N_2", italic)).toEqual([
      { type: "text", text: "N", marks: italic },
      {
        type: "text",
        text: "2",
        marks: [...italic, { type: "subscript" }],
      },
    ]);
  });

  it("returns null for commands that need a math node", () => {
    expect(simpleLatexToTextNodes(String.raw`\pm 20\%`)).toBeNull();
    expect(simpleLatexToTextNodes("")).toBeNull();
    expect(simpleLatexToTextNodes("abc")).toBeNull();
  });
});

describe("simpleLatexToPlainText", () => {
  it("uses unicode subscripts for nitrogen", () => {
    expect(simpleLatexToPlainText("N_2")).toBe("N₂");
    expect(simpleLatexToPlainText("CO_2")).toBe("CO₂");
  });
});
