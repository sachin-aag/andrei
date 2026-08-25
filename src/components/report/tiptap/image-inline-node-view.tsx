"use client";

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { cn } from "@/lib/utils";

export function ImageInlineNodeView({ node, selected }: NodeViewProps) {
  const src = typeof node.attrs.src === "string" ? node.attrs.src : "";
  const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
  const width = typeof node.attrs.width === "number" ? node.attrs.width : undefined;
  const suggestionId =
    typeof node.attrs.suggestionId === "string" && node.attrs.suggestionId
      ? node.attrs.suggestionId
      : null;

  if (!src) return null;

  return (
    <NodeViewWrapper
      as="span"
      className={cn(
        "inline-block align-middle",
        selected && "rounded-sm ring-2 ring-[var(--ring)]",
        suggestionId && "suggestion-image-insert suggestion-image-insert-ai"
      )}
      contentEditable={false}
      data-eval-id={suggestionId ?? undefined}
      data-suggestion-author={suggestionId ? "ai" : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- inline data URLs in TipTap */}
      <img
        src={src}
        alt={alt}
        className="tiptap-image-inline"
        style={width ? { width, height: "auto" } : undefined}
        data-image-inline="true"
      />
    </NodeViewWrapper>
  );
}
