"use client";

import { useCallback, useState, type MouseEvent } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Pencil } from "lucide-react";
import { DrawingEditorDialog } from "@/components/report/drawing-editor-dialog";
import {
  DrawingLabelHtml,
  DrawingOverlay,
} from "@/components/report/tiptap/drawing-overlay";
import { parseImageDrawing, type ImageDrawing } from "@/lib/drawings/overlay";
import { cn } from "@/lib/utils";

export function ImageInlineNodeView({
  node,
  selected,
  editor,
  updateAttributes,
}: NodeViewProps) {
  const src = typeof node.attrs.src === "string" ? node.attrs.src : "";
  const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
  const width = typeof node.attrs.width === "number" ? node.attrs.width : undefined;
  const drawing = parseImageDrawing(node.attrs.drawing);
  const suggestionId =
    typeof node.attrs.suggestionId === "string" && node.attrs.suggestionId
      ? node.attrs.suggestionId
      : null;
  const suggestionKind =
    node.attrs.suggestionKind === "delete" ? "delete" : suggestionId ? "insert" : null;
  const [open, setOpen] = useState(false);
  const editable = editor.isEditable && suggestionKind !== "delete";

  const handleSave = useCallback(
    (next: ImageDrawing) => {
      updateAttributes({ drawing: next });
    },
    [updateAttributes]
  );

  if (!src) return null;

  return (
    <>
      <NodeViewWrapper
        as="span"
        className={cn(
          "group relative inline-block align-middle",
          selected && "rounded-sm ring-2 ring-[var(--ring)]",
          suggestionKind === "insert" && "suggestion-image-insert suggestion-image-insert-ai",
          suggestionKind === "delete" && "suggestion-image-delete suggestion-image-delete-ai"
        )}
        contentEditable={false}
        data-eval-id={suggestionId ?? undefined}
        data-suggestion-author={suggestionId ? "ai" : undefined}
        onDoubleClick={(event: MouseEvent<HTMLSpanElement>) => {
          if (!editable) return;
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- inline data URLs in TipTap */}
        <img
          src={src}
          alt={alt}
          className="tiptap-image-inline"
          style={width ? { width, height: "auto" } : undefined}
          data-image-inline="true"
        />
        <DrawingOverlay drawing={drawing} />
        <DrawingLabelHtml drawing={drawing} />
        {editable ? (
          <button
            type="button"
            className={cn(
              "absolute right-1 top-1 z-10 inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--foreground)] shadow-sm",
              selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              "hover:bg-[var(--secondary)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            )}
            data-testid="annotate-figure"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen(true);
            }}
          >
            <Pencil className="size-3" />
            Annotate
          </button>
        ) : null}
      </NodeViewWrapper>
      {editable ? (
        <DrawingEditorDialog
          open={open}
          src={src}
          alt={alt}
          initialDrawing={drawing}
          onOpenChange={setOpen}
          onSave={handleSave}
        />
      ) : null}
    </>
  );
}
