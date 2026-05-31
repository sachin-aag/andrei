"use client";

import { splitPlainTextWithPlaceholders } from "@/lib/placeholders/plain-text-segments";
import { cn } from "@/lib/utils";

/**
 * Renders plain text with amber placeholder spans (mirror layer / suggestion preview).
 * `baseOffset` is the UTF-16 index of `text` within the full field value (for panel focus sync).
 */
export function PlainTextPlaceholderSpans({
  text,
  baseOffset = 0,
  focusedFromPos = null,
  wrapClassName,
}: {
  text: string;
  baseOffset?: number;
  focusedFromPos?: number | null;
  /** Optional class on a wrapper when the whole run is inside a suggestion mark. */
  wrapClassName?: string;
}) {
  const parts = splitPlainTextWithPlaceholders(text);
  if (parts.length === 1 && parts[0]!.kind === "text") {
    if (wrapClassName) {
      return <span className={wrapClassName}>{text}</span>;
    }
    return <>{text}</>;
  }

  const partsWithOffsets = parts.reduce<Array<{ part: (typeof parts)[number]; fromPos: number }>>(
    (acc, part) => {
      const previous = acc.at(-1);
      const fromPos = previous
        ? previous.fromPos + previous.part.text.length
        : baseOffset;
      return [...acc, { part, fromPos }];
    },
    []
  );
  const nodes = partsWithOffsets.map(({ part, fromPos }, i) => {
    if (part.kind === "placeholder") {
      const isActive = focusedFromPos != null && focusedFromPos === fromPos;
      return (
        <span
          key={i}
          className={cn(
            "placeholder-todo-mirror",
            isActive && "placeholder-todo-active"
          )}
        >
          {part.text}
        </span>
      );
    }
    return <span key={i}>{part.text}</span>;
  });

  if (wrapClassName) {
    return <span className={wrapClassName}>{nodes}</span>;
  }
  return <>{nodes}</>;
}
