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
  insideSuggestion = false,
}: {
  text: string;
  baseOffset?: number;
  focusedFromPos?: number | null;
  /** Track-change styling on the outer wrapper (insert/delete preview runs). */
  wrapClassName?: string;
  /** When true, only bracket placeholders get the amber-over-suggestion styling. */
  insideSuggestion?: boolean;
}) {
  const parts = splitPlainTextWithPlaceholders(text);
  if (parts.length === 1 && parts[0]!.kind === "text") {
    if (wrapClassName) {
      return <span className={wrapClassName}>{text}</span>;
    }
    return <>{text}</>;
  }

  let offset = baseOffset;
  const nodes = parts.map((part, i) => {
    if (part.kind === "placeholder") {
      const fromPos = offset;
      offset += part.text.length;
      const isActive = focusedFromPos != null && focusedFromPos === fromPos;
      return (
        <span
          key={i}
          className={cn(
            "placeholder-todo-mirror",
            insideSuggestion && "placeholder-todo-over-suggestion",
            isActive && "placeholder-todo-active"
          )}
        >
          {part.text}
        </span>
      );
    }
    offset += part.text.length;
    return <span key={i}>{part.text}</span>;
  });

  if (wrapClassName) {
    return <span className={wrapClassName}>{nodes}</span>;
  }
  return <>{nodes}</>;
}
