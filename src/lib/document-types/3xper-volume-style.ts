import type { JSONContent } from "@tiptap/core";

/**
 * 3xper house style: round-thousand litre capacities as `10k L`, not
 * `10000 L`. Keep small volumes (`150 L`, `37 L`), millilitres, kilograms,
 * and printed kilolitres (`10 KL`, `3.0 KL`).
 */
const ROUND_THOUSAND_LITRES_RE =
  /(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.0+)?\s+L\b/g;

export function compact3xperLitreVolumes(text: string): string {
  return text.replace(ROUND_THOUSAND_LITRES_RE, (full, raw: string) => {
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 1000 || n % 1000 !== 0) return full;
    return `${n / 1000}k L`;
  });
}

export function compact3xperLitreVolumesInDoc(node: JSONContent): JSONContent {
  const next: JSONContent = { ...node };
  if (typeof node.text === "string") {
    next.text = compact3xperLitreVolumes(node.text);
  }
  if (node.content) {
    next.content = node.content.map(compact3xperLitreVolumesInDoc);
  }
  return next;
}

export function usesCvpKLitreStyle(section: string | undefined): boolean {
  return Boolean(section?.startsWith("cvp_"));
}
