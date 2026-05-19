"use client";

import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { splitPlainTextWithPlaceholders } from "@/lib/placeholders/plain-text-segments";
import { cn } from "@/lib/utils";

const fieldTypography =
  "px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words";

export function PlainTextHighlightedInput({
  value,
  onChange,
  disabled,
  className,
  placeholder,
  fieldAnchor,
  shellMinHeight,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  fieldAnchor: string;
  shellMinHeight?: number | null;
  "aria-label"?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const segments = useMemo(() => splitPlainTextWithPlaceholders(value), [value]);
  const hasPlaceholders = segments.some((s) => s.kind === "placeholder");

  const syncMirrorScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return;
    mirror.scrollTop = textarea.scrollTop;
    mirror.scrollLeft = textarea.scrollLeft;
  }, []);

  useLayoutEffect(() => {
    if (!hasPlaceholders) return;
    syncMirrorScroll();
  }, [hasPlaceholders, value, syncMirrorScroll]);

  if (!hasPlaceholders) {
    return (
      <Textarea
        ref={textareaRef}
        data-field-anchor={fieldAnchor}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn("text-sm leading-relaxed resize-y", className)}
        style={shellMinHeight != null ? { minHeight: shellMinHeight } : undefined}
      />
    );
  }

  return (
    <div
      className={cn("grid", className)}
      style={shellMinHeight != null ? { minHeight: shellMinHeight } : undefined}
    >
      <div
        ref={mirrorRef}
        aria-hidden
        className={cn(
          "pointer-events-none col-start-1 row-start-1 overflow-hidden rounded-md border border-transparent bg-[var(--input)] shadow-sm",
          fieldTypography
        )}
      >
        {segments.map((seg, i) =>
          seg.kind === "placeholder" ? (
            <span key={i} className="placeholder-todo-mirror">
              {seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </div>
      <Textarea
        ref={textareaRef}
        data-field-anchor={fieldAnchor}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncMirrorScroll}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn(
          "col-start-1 row-start-1 resize-y overflow-y-auto bg-transparent text-transparent caret-[var(--foreground)] selection:bg-primary/20 selection:text-transparent",
          fieldTypography
        )}
        style={{ WebkitTextFillColor: "transparent" } as React.CSSProperties}
      />
    </div>
  );
}
