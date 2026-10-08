"use client";

import type { DrawingShape, ImageDrawing } from "@/lib/drawings/overlay";
import { cn } from "@/lib/utils";

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
  className,
}: {
  drawing: ImageDrawing | null | undefined;
  selectedId?: string | null;
  className?: string;
}) {
  const arrows = drawing?.shapes.filter((shape) => shape.type === "arrow") ?? [];
  if (arrows.length === 0) return null;
  return (
    <svg
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      viewBox="0 0 1 1"
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
}: {
  drawing: ImageDrawing | null | undefined;
  selectedId?: string | null;
}) {
  if (!drawing) return null;
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
                  left: `${shape.x * 100}%`,
                  top: `${shape.y * 100}%`,
                  width: `${shape.w * 100}%`,
                  height: `${shape.h * 100}%`,
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
