import type { JSONContent } from "@tiptap/core";
import type { EvaluationContext } from "@/lib/document-types/types";

function plain(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(plain).join("");
}

function docOf(content: unknown): JSONContent | null {
  if (!content || typeof content !== "object") return null;
  const record = content as Record<string, unknown>;
  if (record.narrative && typeof record.narrative === "object") {
    return record.narrative as JSONContent;
  }
  if (record.table && typeof record.table === "object") {
    return record.table as JSONContent;
  }
  if ((content as JSONContent).type === "doc") return content as JSONContent;
  return null;
}

function tableMatrices(doc: JSONContent | null): string[][][] {
  const tables: string[][][] = [];
  const walk = (node: JSONContent | undefined) => {
    if (!node) return;
    if (node.type === "table") {
      tables.push(
        (node.content ?? []).map((row) =>
          (row.content ?? []).map((cell) => plain(cell).replace(/\s+/g, " ").trim())
        )
      );
      return;
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc ?? undefined);
  return tables;
}

function litres(text: string): number | null {
  const match = text
    .replace(/,/g, "")
    .match(/(\d+(?:\.\d+)?)\s*(KL|k\s*L|L)\b/i);
  if (!match?.[1] || !match[2]) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return match[2].replace(/\s+/g, "").toLowerCase() === "kl" ? value * 1000 : value;
}

function volumesByEquipment(
  doc: JSONContent | null,
  idHeader: (header: string) => boolean,
  volumeHeader: (header: string) => boolean
): Map<string, number> {
  const found = new Map<string, number>();
  for (const matrix of tableMatrices(doc)) {
    const headers = matrix[0] ?? [];
    const idCol = headers.findIndex(idHeader);
    const volumeCol = headers.findIndex(volumeHeader);
    if (idCol < 0 || volumeCol < 0) continue;
    for (const row of matrix.slice(1)) {
      const id = (row[idCol] ?? "").trim();
      if (!id) continue;
      const volume = litres(row[volumeCol] ?? "");
      if (volume == null) continue;
      found.set(id.toUpperCase(), volume);
    }
  }
  return found;
}

/**
 * 9.0 Considered volume and 11.0 Rinse volume (L) must name the same litres
 * for the same equipment ID. Blank pairs are skipped.
 */
export function checkCvpRinseVolumeConsistency(ctx: EvaluationContext): {
  status: "met" | "not_met";
  reasoning: string;
} {
  const considered = volumesByEquipment(
    docOf(ctx.dependencies.cvp_rinse_volume),
    (header) => /equipment\s*no/i.test(header),
    (header) => /considered volume/i.test(header)
  );
  const used = volumesByEquipment(
    docOf(ctx.content),
    (header) => /equipment\s*id/i.test(header),
    (header) => /^rinse volume\b/i.test(header)
  );
  const mismatches: string[] = [];
  let compared = 0;
  for (const [id, left] of considered) {
    const right = used.get(id);
    if (right == null) continue;
    compared += 1;
    if (Math.abs(left - right) > 0.001) {
      mismatches.push(
        `${id}: Section 9.0 considered volume is ${left} L and Section 11.0 rinse volume is ${right} L`
      );
    }
  }
  if (mismatches.length > 0) {
    return { status: "not_met", reasoning: mismatches.join("; ") };
  }
  if (compared === 0) {
    return {
      status: "met",
      reasoning:
        "No equipment has both a considered rinse volume and a Section 11.0 rinse volume yet.",
    };
  }
  return {
    status: "met",
    reasoning: `${compared} equipment rinse volume(s) agree between Section 9.0 and Section 11.0.`,
  };
}
