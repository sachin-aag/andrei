import type { CriterionStatus } from "@/db/schema";
import type { EvaluationContext } from "@/lib/document-types/types";

type Verdict = { status: CriterionStatus; reasoning: string };

function plainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: unknown; content?: unknown };
  if (typeof n.text === "string") return n.text;
  if (!Array.isArray(n.content)) return "";
  return n.content.map(plainText).join(" ");
}

function field(content: unknown, key: "narrative" | "table"): unknown {
  return (content as Record<string, unknown> | null | undefined)?.[key];
}

export function checkNarrativePresent(ctx: EvaluationContext): Verdict {
  const text = plainText(field(ctx.content, "narrative")).replace(/\s+/g, " ").trim();
  if (text.length < 20) {
    return { status: "not_met", reasoning: "The section is empty." };
  }
  return { status: "met", reasoning: "The section has content." };
}

/**
 * Body cells beyond the seeded labels. Only the last `valueColumns` columns
 * count, so a pre-filled document-name column does not read as filled.
 */
function filledValueCells(table: unknown, valueColumns: number): { filled: number; rows: number } {
  const doc = table as { content?: Array<{ type?: string; content?: unknown[] }> } | undefined;
  let filled = 0;
  let rows = 0;
  for (const node of doc?.content ?? []) {
    if (node.type !== "table") continue;
    for (const row of (node.content ?? []) as Array<{ content?: Array<{ type?: string }> }>) {
      const cells = row.content ?? [];
      if (cells.every((cell) => cell.type === "tableHeader")) continue;
      rows += 1;
      for (const cell of cells.slice(-valueColumns)) {
        if (plainText(cell).trim()) filled += 1;
      }
    }
  }
  return { filled, rows };
}

export function tableValuesCheck(valueColumns: number) {
  return (ctx: EvaluationContext): Verdict => {
    const { filled, rows } = filledValueCells(field(ctx.content, "table"), valueColumns);
    if (rows === 0 || filled === 0) {
      return { status: "not_met", reasoning: "No table values are filled in." };
    }
    return { status: "met", reasoning: `${filled} table value(s) are filled in.` };
  };
}
