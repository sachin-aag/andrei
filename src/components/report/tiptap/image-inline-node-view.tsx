"use client";

import { useCallback, useRef } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  clampImageInlineWidth,
} from "@/lib/tiptap/image-inline-dimensions";
import { cn } from "@/lib/utils";

export function ImageInlineNodeView({
  node,
  selected,
  editor,
  updateAttributes,
}: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const src = typeof node.attrs.src === "string" ? node.attrs.src : "";
  const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
  const width = typeof node.attrs.width === "number" ? node.attrs.width : undefined;
  const suggestionId =
    typeof node.attrs.suggestionId === "string" && node.attrs.suggestionId
      ? node.attrs.suggestionId
      : null;
  const suggestionKind =
    node.attrs.suggestionKind === "delete" ? "delete" : suggestionId ? "insert" : null;
  const resizable =
    editor.isEditable && selected && !suggestionId && suggestionKind !== "delete";

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!resizable) return;

      const img = imgRef.current;
      if (!img) return;

      const startX = event.clientX;
      const startWidth = width ?? img.offsetWidth;
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      const onPointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = clampImageInlineWidth(
          startWidth + (moveEvent.clientX - startX)
        );
        updateAttributes({ width: nextWidth });
      };

      const onPointerUp = (upEvent: PointerEvent) => {
        handle.releasePointerCapture(upEvent.pointerId);
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", onPointerUp);
        handle.removeEventListener("pointercancel", onPointerUp);
      };

      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerUp);
      handle.addEventListener("pointercancel", onPointerUp);
    },
    [resizable, updateAttributes, width]
  );

  if (!src) return null;

  return (
    <NodeViewWrapper
      as="span"
      className={cn(
        "relative inline-block max-w-full align-middle",
        selected && "rounded-sm ring-2 ring-[var(--ring)]",
        suggestionKind === "insert" && "suggestion-image-insert suggestion-image-insert-ai",
        suggestionKind === "delete" && "suggestion-image-delete suggestion-image-delete-ai"
      )}
      contentEditable={false}
      data-eval-id={suggestionId ?? undefined}
      data-suggestion-author={suggestionId ? "ai" : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- inline data URLs in TipTap */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="tiptap-image-inline block max-w-full"
        style={width ? { width, height: "auto" } : undefined}
        data-image-inline="true"
        draggable={false}
      />
      {resizable ? (
        <button
          type="button"
          aria-label="Resize image"
          data-testid="image-inline-resize-handle"
          className={cn(
            "absolute bottom-0 right-0 z-10 size-3 translate-x-1/2 translate-y-1/2",
            "cursor-se-resize rounded-sm border border-[var(--border)] bg-[var(--background)]",
            "shadow-sm hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          )}
          onPointerDown={onResizePointerDown}
        />
      ) : null}
    </NodeViewWrapper>
  );
}
