import { collectPlaceholderSpans } from "./find";

export type PlainTextSegment =
  | { kind: "text"; text: string }
  | { kind: "placeholder"; text: string };

/** Split plain text into normal runs and placeholder spans for inline highlighting. */
export function splitPlainTextWithPlaceholders(value: string): PlainTextSegment[] {
  if (!value) return [];

  const spans = collectPlaceholderSpans(value);
  if (spans.length === 0) return [{ kind: "text", text: value }];

  const segments: PlainTextSegment[] = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.fromRel > cursor) {
      segments.push({ kind: "text", text: value.slice(cursor, span.fromRel) });
    }
    segments.push({ kind: "placeholder", text: span.text });
    cursor = span.toRel;
  }

  if (cursor < value.length) {
    segments.push({ kind: "text", text: value.slice(cursor) });
  }

  return segments;
}

export function plainTextPlaceholderContext(
  text: string,
  placeholder: { fromPos: number; toPos: number; text: string },
  radius = 50
): { beforeCtx: string; afterCtx: string } {
  const from = Math.max(0, placeholder.fromPos - radius);
  const to = Math.min(text.length, placeholder.toPos + radius);
  return {
    beforeCtx: text.slice(from, placeholder.fromPos),
    afterCtx: text.slice(placeholder.toPos, to),
  };
}
