"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";

export function resizeTextareaToContent(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export const AutoResizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  TextareaProps
>(({ className, value, onChange, ...props }, ref) => {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

  React.useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    resizeTextareaToContent(el);
  }, [value]);

  return (
    <Textarea
      ref={innerRef}
      value={value}
      rows={1}
      onChange={(event) => {
        resizeTextareaToContent(event.currentTarget);
        onChange?.(event);
      }}
      className={cn("resize-none overflow-hidden", className)}
      {...props}
    />
  );
});
AutoResizeTextarea.displayName = "AutoResizeTextarea";
