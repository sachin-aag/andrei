"use client";

import type { Ref } from "react";
import {
  drawingHasOverflow,
  extentHeight,
  extentWidth,
  type DrawingExtent,
  type DrawingShape,
  type ImageDrawing,
} from "@/lib/drawings/overlay";
import { cn } from "@/lib/utils";

const PHOTO_EXTENT: DrawingExtent = { minX: 0, minY: 0, maxX: 1, maxY: 1 };

function ArrowShape({
  shape,
  selected,
}: {
  shape: Extract<DrawingShape, { type: "arrow" }>;
  selected?: boolean;
}) {
  const markerId = `arrowhead-${shape.id}`;
  return (
    <g>
      <defs>
        <marker
          id={markerId}
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0 0 L8 4 L0 8 z" fill={shape.color} />
        </marker>
      </defs>
      <line
        x1={shape.x1}
        y1={shape.y1}
        x2={shape.x2}
        y2={shape.y2}
        stroke={shape.color}
        strokeWidth={selected ? 0.012 : 0.008}
        vectorEffect="non-scaling-stroke"
        markerEnd={`url(#${markerId})`}
      />
      {selected ? (
        <>
          <circle
            cx={shape.x1}
            cy={shape.y1}
            r="0.012"
            fill="#ffffff"
            stroke={shape.color}
            strokeWidth="0.004"
          />
          <circle
            cx={shape.x2}
            cy={shape.y2}
            r="0.012"
            fill="#ffffff"
            stroke={shape.color}
            strokeWidth="0.004"
          />
        </>
      ) : null}
    </g>
  );
}

/** Arrows only — labels are HTML so text stays sharp. */
export function DrawingOverlay({
  drawing,
  selectedId,
  extent = PHOTO_EXTENT,
  className,
}: {
  drawing: ImageDrawing | null | undefined;
  selectedId?: string | null;
  extent?: DrawingExtent;
  className?: string;
}) {
  const arrows = drawing?.shapes.filter((shape) => shape.type === "arrow") ?? [];
  if (arrows.length === 0) return null;
  const width = extentWidth(extent);
  const height = extentHeight(extent);
  return (
    <svg
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      viewBox={`${extent.minX} ${extent.minY} ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {arrows.map((shape) => (
        <ArrowShape
          key={shape.id}
          shape={shape}
          selected={selectedId === shape.id}
        />
      ))}
    </svg>
  );
}

export function DrawingLabelHtml({
  drawing,
  selectedId,
  extent = PHOTO_EXTENT,
}: {
  drawing: ImageDrawing | null | undefined;
  selectedId?: string | null;
  extent?: DrawingExtent;
}) {
  if (!drawing) return null;
  const width = extentWidth(extent);
  const height = extentHeight(extent);
  return (
    <>
      {drawing.shapes.flatMap((shape) =>
        shape.type === "label"
          ? [
              <div
                key={shape.id}
                className={cn(
                  "pointer-events-none absolute box-border flex items-center justify-center overflow-hidden bg-white px-1 text-center text-[11px] leading-tight font-semibold text-neutral-900",
                  selectedId === shape.id && "ring-2 ring-[var(--ring)]"
                )}
                style={{
                  left: `${((shape.x - extent.minX) / width) * 100}%`,
                  top: `${((shape.y - extent.minY) / height) * 100}%`,
                  width: `${(shape.w / width) * 100}%`,
                  height: `${(shape.h / height) * 100}%`,
                  border: `2px solid ${shape.color}`,
                }}
              >
                <span className="whitespace-pre-wrap">{shape.text}</span>
              </div>,
            ]
          : []
      )}
    </>
  );
}

type DrawingComposedFigureProps = {
  src: string;
  alt?: string;
  drawing: ImageDrawing | null | undefined;
  selectedId?: string | null;
  extent: DrawingExtent;
  imgWidth?: number;
  imgClassName?: string;
  surface?: "none" | "white" | "checkerboard";
  photoOutline?: boolean;
  className?: string;
  frameRef?: Ref<HTMLDivElement>;
  testId?: string;
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (event: React.PointerEvent<HTMLDivElement>) => void;
};

/**
 * Photo in the 0–1 cell, overflow tracks for labels/arrows that sit outside.
 * When there is no overflow and the extent is the photo, this is a tight wrap.
 */
export function DrawingComposedFigure({
  src,
  alt,
  drawing,
  selectedId,
  extent,
  imgWidth,
  imgClassName,
  surface = "none",
  photoOutline = false,
  className,
  frameRef,
  testId,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: DrawingComposedFigureProps) {
  const left = Math.max(0, -extent.minX);
  const right = Math.max(0, extent.maxX - 1);
  const top = Math.max(0, -extent.minY);
  const bottom = Math.max(0, extent.maxY - 1);
  const overflow =
    left > 0 || right > 0 || top > 0 || bottom > 0 || drawingHasOverflow(drawing);
  const surfaceClass =
    surface === "checkerboard"
      ? "bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px]"
      : surface === "white"
        ? "bg-white"
        : null;

  return (
    <div
      ref={frameRef}
      data-testid={testId}
      className={cn(
        overflow ? "relative inline-grid max-w-full align-middle" : "relative inline-block max-w-full align-middle",
        surfaceClass,
        className
      )}
      style={
        overflow
          ? {
              gridTemplateColumns: `${left}fr 1fr ${right}fr`,
              gridTemplateRows: `${top}fr 1fr ${bottom}fr`,
            }
          : undefined
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- inline data URLs in TipTap */}
      <img
        src={src}
        alt={alt || ""}
        draggable={false}
        className={cn(
          "block h-auto max-w-full select-none",
          overflow && "col-start-2 row-start-2",
          photoOutline && "outline outline-1 outline-black/25",
          imgClassName
        )}
        style={imgWidth ? { width: imgWidth, height: "auto" } : undefined}
        data-image-inline="true"
      />
      <div className="pointer-events-none absolute inset-0">
        <DrawingOverlay drawing={drawing} selectedId={selectedId} extent={extent} />
        <DrawingLabelHtml drawing={drawing} selectedId={selectedId} extent={extent} />
      </div>
    </div>
  );
}
