/**
 * Basic arithmetic for chat. The model must not multiply in its head —
 * rinse-volume / MACO cells and similar products go through this tool, then
 * the result is a computed fact the grounding gate will accept.
 *
 * No eval, no variables, no units. Substitute numbers first.
 */

import type { HardFact } from "@/lib/ai/chat/claim-facts";
import { factNumericTokens } from "@/lib/ai/chat/analysis-evidence";

export const CALCULATE_TOOL_NAME = "calculate";

export const CALCULATE_MAX_EXPRESSION_CHARS = 400;
export const CALCULATE_MAX_EXPRESSIONS = 24;
export const CALCULATE_MAX_ABS_RESULT = 1e12;

const FUNC_NAMES = new Set([
  "sqrt",
  "abs",
  "round",
  "ceil",
  "floor",
  "min",
  "max",
]);

type Op = "+" | "-" | "*" | "/" | "^";

type Token =
  | { kind: "number"; value: number }
  | { kind: "op"; value: Op }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" }
  | { kind: "ident"; value: string }
  | { kind: "sqrt" };

export type CalculateOk = {
  ok: true;
  expression: string;
  result: number;
  display: string;
  rounded: number;
};

export type CalculateErr = {
  ok: false;
  expression: string;
  error: string;
};

export type CalculateItem = CalculateOk | CalculateErr;

export type CalculationEvidence = {
  expression: string;
  values: Set<string>;
};

export type CalculateBatch = {
  status: "ok" | "partial" | "error";
  results: CalculateItem[];
  note: string;
};

const CALCULATE_NOTE =
  "These are computed values. Write display into the answer cell (or `expression = display` when showing the working, e.g. `30.96 × 3 = 92.88`). Use rounded only when the source form uses a whole number (considered volume). Do not invent a different product.";

class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

export function formatCalculationResult(value: number): string {
  if (!Number.isFinite(value)) {
    throw new ParseError("Result is not a finite number.");
  }
  if (Object.is(value, -0)) return "0";
  if (Number.isInteger(value)) return String(value);
  const shortened = Number(value.toPrecision(12));
  if (Number.isInteger(shortened)) return String(shortened);
  return String(shortened);
}

function numericForms(value: number): string[] {
  if (!Number.isFinite(value)) return [];
  const forms = new Set<string>([String(value), formatCalculationResult(value)]);
  if (Number.isInteger(value)) {
    forms.add(value.toFixed(1));
    forms.add(value.toFixed(2));
  } else {
    forms.add(value.toFixed(1));
    forms.add(value.toFixed(2));
    forms.add(value.toFixed(3));
    forms.add(String(Math.round(value)));
  }
  return [...forms];
}

export function calculationEvidenceFromItem(
  item: CalculateOk
): CalculationEvidence {
  const values = new Set<string>(numericForms(item.result));
  values.add(item.display);
  values.add(String(item.rounded));
  return { expression: item.expression, values };
}

export function calculationSupportingFact(
  fact: HardFact,
  evidence: readonly CalculationEvidence[]
): CalculationEvidence | null {
  if (evidence.length === 0) return null;
  if (fact.kind === "identifier" || fact.kind === "date") return null;
  const tokens = factNumericTokens(fact);
  if (tokens.length === 0) return null;
  for (const entry of evidence) {
    if (tokens.every((token) => entry.values.has(token))) return entry;
  }
  return null;
}

export function calculationEvidenceFromToolOutput(
  output: unknown
): CalculationEvidence[] {
  let root = output;
  if (
    root &&
    typeof root === "object" &&
    !Array.isArray(root) &&
    (root as { type?: unknown }).type === "json" &&
    "value" in root
  ) {
    root = (root as { value: unknown }).value;
  }
  if (!root || typeof root !== "object" || Array.isArray(root)) return [];
  const results = (root as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const evidence: CalculationEvidence[] = [];
  for (const row of results) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const rec = row as Record<string, unknown>;
    if (rec.ok !== true) continue;
    if (typeof rec.result !== "number" || !Number.isFinite(rec.result)) continue;
    const expression =
      typeof rec.expression === "string" ? rec.expression : "";
    const display =
      typeof rec.display === "string"
        ? rec.display
        : formatCalculationResult(rec.result);
    const rounded =
      typeof rec.rounded === "number" && Number.isFinite(rec.rounded)
        ? rec.rounded
        : Math.round(rec.result);
    evidence.push(
      calculationEvidenceFromItem({
        ok: true,
        expression,
        result: rec.result,
        display,
        rounded,
      })
    );
  }
  return evidence;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = source.length;
  while (i < len) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i += 1;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma" });
      i += 1;
      continue;
    }
    if (ch === "+" ) {
      tokens.push({ kind: "op", value: "+" });
      i += 1;
      continue;
    }
    if (ch === "-" || ch === "−" || ch === "–") {
      tokens.push({ kind: "op", value: "-" });
      i += 1;
      continue;
    }
    if (source.startsWith("**", i)) {
      tokens.push({ kind: "op", value: "^" });
      i += 2;
      continue;
    }
    if (ch === "*" || ch === "×" || ch === "·" || ch === "⋅") {
      tokens.push({ kind: "op", value: "*" });
      i += 1;
      continue;
    }
    if (ch === "/" || ch === "÷") {
      tokens.push({ kind: "op", value: "/" });
      i += 1;
      continue;
    }
    if (ch === "^") {
      tokens.push({ kind: "op", value: "^" });
      i += 1;
      continue;
    }
    if (ch === "√") {
      tokens.push({ kind: "sqrt" });
      i += 1;
      continue;
    }
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      const start = i;
      i += 1;
      while (i < len && /[0-9.]/.test(source[i]!)) i += 1;
      if (i < len && (source[i] === "e" || source[i] === "E")) {
        i += 1;
        if (i < len && (source[i] === "+" || source[i] === "-")) i += 1;
        const expStart = i;
        while (i < len && /[0-9]/.test(source[i]!)) i += 1;
        if (i === expStart) {
          throw new ParseError("Number has an incomplete exponent.");
        }
      }
      const raw = source.slice(start, i);
      if (raw === "." || raw.split(".").length > 2) {
        throw new ParseError(`Invalid number '${raw}'.`);
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new ParseError(`Invalid number '${raw}'.`);
      }
      tokens.push({ kind: "number", value });
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < len && /[A-Za-z]/.test(source[i]!)) i += 1;
      const ident = source.slice(start, i).toLowerCase();
      if (!FUNC_NAMES.has(ident)) {
        throw new ParseError(
          `Unknown name '${source.slice(start, i)}'. Drop units and variables; pass numbers only.`
        );
      }
      tokens.push({ kind: "ident", value: ident });
      continue;
    }
    throw new ParseError(`Unexpected character '${ch}'.`);
  }
  return tokens;
}

function evaluateTokens(tokens: Token[]): number {
  let pos = 0;
  let depth = 0;

  const peek = (): Token | undefined => tokens[pos];
  const take = (): Token => {
    const token = tokens[pos];
    if (!token) throw new ParseError("Unexpected end of expression.");
    pos += 1;
    return token;
  };

  const parseExpression = (): number => parseAdd();

  const parseAdd = (): number => {
    let value = parseMul();
    for (;;) {
      const token = peek();
      if (!token || token.kind !== "op" || (token.value !== "+" && token.value !== "-")) {
        return value;
      }
      take();
      const rhs = parseMul();
      value = token.value === "+" ? value + rhs : value - rhs;
    }
  };

  const parseMul = (): number => {
    let value = parseUnary();
    for (;;) {
      const token = peek();
      if (token?.kind === "lparen" || token?.kind === "ident" || token?.kind === "sqrt") {
        // 2(3+4) / 2sqrt(9)
        value *= parseUnary();
        continue;
      }
      if (!token || token.kind !== "op" || (token.value !== "*" && token.value !== "/")) {
        return value;
      }
      take();
      const rhs = parseUnary();
      if (token.value === "/") {
        if (rhs === 0) throw new ParseError("Division by zero.");
        value /= rhs;
      } else {
        value *= rhs;
      }
    }
  };

  const parseUnary = (): number => {
    const token = peek();
    if (token?.kind === "op" && token.value === "-") {
      take();
      return -parseUnary();
    }
    if (token?.kind === "op" && token.value === "+") {
      take();
      return parseUnary();
    }
    if (token?.kind === "sqrt") {
      take();
      const arg = parseUnary();
      if (arg < 0) throw new ParseError("Square root of a negative number.");
      return Math.sqrt(arg);
    }
    return parsePower();
  };

  const parsePower = (): number => {
    const base = parsePrimary();
    const token = peek();
    if (token?.kind === "op" && token.value === "^") {
      take();
      const exp = parseUnary();
      const value = base ** exp;
      if (!Number.isFinite(value)) {
        throw new ParseError("Power overflowed.");
      }
      return value;
    }
    return base;
  };

  const parsePrimary = (): number => {
    const token = take();
    if (token.kind === "number") return token.value;
    if (token.kind === "lparen") {
      depth += 1;
      if (depth > 32) throw new ParseError("Expression is nested too deeply.");
      const value = parseExpression();
      const close = take();
      if (close.kind !== "rparen") throw new ParseError("Missing ')'.");
      depth -= 1;
      return value;
    }
    if (token.kind === "ident") {
      const open = take();
      if (open.kind !== "lparen") {
        throw new ParseError(`Function ${token.value} needs parentheses.`);
      }
      const args: number[] = [parseExpression()];
      while (peek()?.kind === "comma") {
        take();
        args.push(parseExpression());
      }
      const close = take();
      if (close.kind !== "rparen") throw new ParseError("Missing ')'.");
      return applyFunction(
        token.value as "sqrt" | "abs" | "round" | "ceil" | "floor" | "min" | "max",
        args
      );
    }
    throw new ParseError("Expected a number, function, or '('.");
  };

  const value = parseExpression();
  if (pos < tokens.length) {
    throw new ParseError("Unexpected extra characters after the expression.");
  }
  return value;
}

function applyFunction(
  name: "sqrt" | "abs" | "round" | "ceil" | "floor" | "min" | "max",
  args: number[]
): number {
  switch (name) {
    case "sqrt": {
      if (args.length !== 1) throw new ParseError("sqrt takes one argument.");
      const arg = args[0]!;
      if (arg < 0) throw new ParseError("Square root of a negative number.");
      return Math.sqrt(arg);
    }
    case "abs":
      if (args.length !== 1) throw new ParseError("abs takes one argument.");
      return Math.abs(args[0]!);
    case "ceil":
      if (args.length !== 1) throw new ParseError("ceil takes one argument.");
      return Math.ceil(args[0]!);
    case "floor":
      if (args.length !== 1) throw new ParseError("floor takes one argument.");
      return Math.floor(args[0]!);
    case "round": {
      if (args.length < 1 || args.length > 2) {
        throw new ParseError("round takes one or two arguments.");
      }
      const value = args[0]!;
      const digits = args[1] ?? 0;
      if (!Number.isInteger(digits) || digits < 0 || digits > 10) {
        throw new ParseError("round digits must be an integer 0–10.");
      }
      const factor = 10 ** digits;
      return Math.round(value * factor) / factor;
    }
    case "min":
      if (args.length < 1) throw new ParseError("min needs at least one argument.");
      return Math.min(...args);
    case "max":
      if (args.length < 1) throw new ParseError("max needs at least one argument.");
      return Math.max(...args);
    default: {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}

export function evaluateArithmetic(expression: string): CalculateItem {
  const trimmed = expression.trim();
  if (!trimmed) {
    return { ok: false, expression, error: "Expression is empty." };
  }
  if (trimmed.length > CALCULATE_MAX_EXPRESSION_CHARS) {
    return {
      ok: false,
      expression,
      error: `Expression is longer than ${CALCULATE_MAX_EXPRESSION_CHARS} characters.`,
    };
  }
  try {
    const tokens = tokenize(trimmed);
    if (tokens.length === 0) {
      return { ok: false, expression, error: "Expression is empty." };
    }
    const result = evaluateTokens(tokens);
    if (!Number.isFinite(result)) {
      return { ok: false, expression, error: "Result is not a finite number." };
    }
    if (Math.abs(result) > CALCULATE_MAX_ABS_RESULT) {
      return {
        ok: false,
        expression,
        error: "Result is larger than this tool allows.",
      };
    }
    const display = formatCalculationResult(result);
    return {
      ok: true,
      expression: trimmed,
      result,
      display,
      rounded: Math.round(result),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not evaluate.";
    return { ok: false, expression: trimmed, error: message };
  }
}

export function calculateExpressions(expressions: string[]): CalculateBatch {
  const results = expressions.map((expression) => evaluateArithmetic(expression));
  const okCount = results.filter((row) => row.ok).length;
  const status =
    okCount === results.length ? "ok" : okCount === 0 ? "error" : "partial";
  return { status, results, note: CALCULATE_NOTE };
}

export function evidenceFromCalculateBatch(
  batch: CalculateBatch
): CalculationEvidence[] {
  return batch.results.flatMap((row) =>
    row.ok ? [calculationEvidenceFromItem(row)] : []
  );
}
