import { collectPlaceholderSpans } from "./find";

export type PlainPlaceholderSpan = {
  from: number;
  to: number;
  text: string;
};

export function findPlaceholderSpansInPlainText(text: string): PlainPlaceholderSpan[] {
  return collectPlaceholderSpans(text).map((s) => ({
    from: s.fromRel,
    to: s.toRel,
    text: s.text,
  }));
}

/** Replace bracket placeholders in plain text (offsets from `findPlaceholderSpansInPlainText`). */
export function applyPlaceholderFillsToPlainText(
  text: string,
  fills: Record<number, string>
): string {
  const spans = findPlaceholderSpansInPlainText(text);
  if (spans.length === 0) return text;

  const parts: Array<{ from: number; to: number; value: string }> = [];
  spans.forEach((span, index) => {
    const value = fills[index]?.trim();
    if (!value) return;
    parts.push({ from: span.from, to: span.to, value });
  });

  if (parts.length === 0) return text;

  parts.sort((a, b) => b.from - a.from);
  let result = text;
  for (const p of parts) {
    result = result.slice(0, p.from) + p.value + result.slice(p.to);
  }
  return result;
}
