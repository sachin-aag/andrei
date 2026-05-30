"use client";

import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { resizeTextareaToContent } from "@/components/ui/auto-resize-textarea";
import { fromPosFromPlaceholderId } from "@/lib/placeholders/find";
import { splitPlainTextWithPlaceholders } from "@/lib/placeholders/plain-text-segments";
import { PlainTextPlaceholderSpans } from "@/components/report/plain-text-placeholder-spans";
import { useReportPlaceholders } from "@/providers/report-provider";
import type { SectionType } from "@/db/schema";
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
  onEditLayoutHeight,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  fieldAnchor: string;
  shellMinHeight?: number | null;
  /** Reports the laid-out edit surface height (for suggestion preview transitions). */
  onEditLayoutHeight?: (height: number) => void;
  "aria-label"?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const { focusedPanelPlaceholderId } = useReportPlaceholders();
  const segments = useMemo(() => splitPlainTextWithPlaceholders(value), [value]);
  const hasPlaceholders = segments.some((s) => s.kind === "placeholder");

  const fieldDot = fieldAnchor.indexOf(".");
  const fieldSection =
    fieldDot >= 0 ? (fieldAnchor.slice(0, fieldDot) as SectionType) : null;
  const fieldContentPath = fieldDot >= 0 ? fieldAnchor.slice(fieldDot + 1) : "";
  const focusedFromPos =
    fieldSection && fieldContentPath && focusedPanelPlaceholderId
      ? fromPosFromPlaceholderId(
          focusedPanelPlaceholderId,
          fieldSection,
          fieldContentPath
        )
      : null;

  const syncEditHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    resizeTextareaToContent(textarea);
    if (hasPlaceholders) {
      const mirror = mirrorRef.current;
      if (mirror) {
        mirror.style.minHeight = `${textarea.offsetHeight}px`;
      }
    }
    onEditLayoutHeight?.(textarea.offsetHeight);
  }, [hasPlaceholders, onEditLayoutHeight]);

  useLayoutEffect(() => {
    syncEditHeight();
  }, [value, shellMinHeight, syncEditHeight]);

  const lockedMinStyle =
    shellMinHeight != null ? { minHeight: shellMinHeight } : undefined;

  if (!hasPlaceholders) {
    return (
      <Textarea
        ref={textareaRef}
        data-field-anchor={fieldAnchor}
        value={value}
        onChange={(e) => {
          resizeTextareaToContent(e.currentTarget);
          onChange(e.target.value);
          onEditLayoutHeight?.(e.currentTarget.offsetHeight);
        }}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn(
          "text-sm leading-relaxed resize-none overflow-hidden",
          className
        )}
        style={lockedMinStyle}
      />
    );
  }

  return (
    <div className={cn("grid", className)} style={lockedMinStyle}>
      <div
        ref={mirrorRef}
        aria-hidden
        className={cn(
          "pointer-events-none col-start-1 row-start-1 rounded-md border border-transparent bg-[var(--input)] shadow-sm",
          fieldTypography
        )}
      >
        <PlainTextPlaceholderSpans
          text={value}
          focusedFromPos={focusedFromPos}
        />
      </div>
      <Textarea
        ref={textareaRef}
        data-field-anchor={fieldAnchor}
        value={value}
        onChange={(e) => {
          resizeTextareaToContent(e.currentTarget);
          onChange(e.target.value);
          const mirror = mirrorRef.current;
          if (mirror) {
            mirror.style.minHeight = `${e.currentTarget.offsetHeight}px`;
          }
          onEditLayoutHeight?.(e.currentTarget.offsetHeight);
        }}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn(
          "col-start-1 row-start-1 resize-none overflow-hidden bg-transparent text-transparent caret-[var(--foreground)] selection:bg-primary/20 selection:text-transparent",
          fieldTypography
        )}
        style={{ WebkitTextFillColor: "transparent" } as React.CSSProperties}
      />
    </div>
  );
}
